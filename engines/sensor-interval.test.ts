import { describe, expect, it } from 'vitest'
import { validateProbe } from './safeguards/sensor'
import { probeWindowS, staleAfterS, typicalIntervalS } from './sensor-interval'

const now = new Date('2026-04-02T04:00:00Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000)

describe('typicalIntervalS', () => {
  it('reads a 15-minute probe', () => {
    expect(typicalIntervalS([0, 0.25, 0.5, 0.75].map(h => hoursAgo(h)))).toBe(900)
  })

  it('reads a probe set to 12 readings a day, in any order', () => {
    expect(typicalIntervalS([hoursAgo(0), hoursAgo(4), hoursAgo(2), hoursAgo(6)].map(d => d.toISOString()))).toBe(7200)
  })

  it('is not moved by one outage', () => {
    expect(typicalIntervalS([0, 2, 4, 6, 20].map(h => hoursAgo(h)))).toBe(7200)
  })

  it('needs two distinct readings', () => {
    expect(typicalIntervalS([hoursAgo(1)])).toBeNull()
    expect(typicalIntervalS([hoursAgo(1), hoursAgo(1)])).toBeNull()
  })
})

describe('staleAfterS and probeWindowS', () => {
  it('allows one missed reading plus the pull', () => {
    expect(staleAfterS(900)).toBe(5400)
    expect(staleAfterS(7200)).toBe(18000)
  })

  it('keeps the six-hour window for a fast probe and widens it for a slow one', () => {
    expect(probeWindowS(900)).toBe(6 * 3600)
    expect(probeWindowS(null)).toBe(6 * 3600)
    expect(probeWindowS(7200)).toBe(24 * 3600)
  })

  it('lets the stuck check fire on a 2-hourly probe', () => {
    const interval = 7200
    const windowH = probeWindowS(interval) / 3600
    const readings = Array.from({ length: windowH / 2 }, (_, i) => ({ at: hoursAgo(windowH - 2 - 2 * i), value: 21.4 }))
    const limits = { maxAgeS: staleAfterS(interval), minPlausible: 0, maxPlausible: 65, maxStep: 12 }
    expect(validateProbe(readings, now, limits)).toEqual({ valid: false, reason: 'STUCK' })
    // Six hours of the same probe hold three readings: too few to call it stuck.
    expect(validateProbe(readings.slice(-3), now, limits)).toEqual({ valid: true, reason: 'OK' })
  })
})
