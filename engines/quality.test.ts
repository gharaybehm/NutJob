import { describe, expect, it } from 'vitest'
import { checkSeries, usableReadings, SOIL_MOISTURE_RULES, type RawReading } from './quality'

const now = new Date('2026-09-20T12:00:00Z')
const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000).toISOString()
const series = (vals: number[], stepH = 1): RawReading[] =>
  vals.map((value, i) => ({ at: at((vals.length - i) * stepH), value }))

describe('checkSeries', () => {
  it('passes a healthy slowly-drying series', () => {
    const q = checkSeries(series([28, 27.5, 27, 26.6, 26.1]), SOIL_MOISTURE_RULES, now)
    expect(q.health).toBe('ok')
    expect(q.readings.every(r => r.flag === 'ok')).toBe(true)
  })

  it('flags out-of-range values and excludes them', () => {
    const q = checkSeries(series([28, 999, 27]), SOIL_MOISTURE_RULES, now)
    expect(q.readings[1].flag).toBe('out_of_range')
    expect(usableReadings(q)).toHaveLength(2)
  })

  it('flags an implausible jump but keeps the reading, marking the sensor suspect', () => {
    const q = checkSeries(series([20, 20.5, 55, 55.5]), SOIL_MOISTURE_RULES, now)
    expect(q.readings[2].flag).toBe('jump')
    expect(usableReadings(q)).toHaveLength(4)
    expect(q.health).toBe('suspect')
  })

  it('flags duplicate timestamps', () => {
    const t = at(1)
    const q = checkSeries([{ at: t, value: 25 }, { at: t, value: 25 }], SOIL_MOISTURE_RULES, now)
    expect(q.readings.map(r => r.flag)).toEqual(['ok', 'duplicate'])
  })

  it('marks a sensor stuck after many identical readings', () => {
    const q = checkSeries(series(Array(14).fill(24.3)), SOIL_MOISTURE_RULES, now)
    expect(q.readings.some(r => r.flag === 'stuck')).toBe(true)
    expect(q.health).toBe('suspect')
  })

  it('marks a sensor failed when readings stop', () => {
    const old = [{ at: at(48), value: 25 }, { at: at(47), value: 25.2 }]
    const q = checkSeries(old, SOIL_MOISTURE_RULES, now)
    expect(q.health).toBe('failed')
    expect(q.reasons[0]).toMatch(/No reading for/)
  })

  it('marks a sensor failed with no readings at all', () => {
    expect(checkSeries([], SOIL_MOISTURE_RULES, now).health).toBe('failed')
  })
})
