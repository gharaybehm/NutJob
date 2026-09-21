import { describe, expect, it } from 'vitest'
import { checkStation, modelValueAt, type HourlyModel, type StationReading } from './station-check'

const hour = (day: number, h: number) => `2026-07-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00Z`

/** A model with the same values every hour for days 1-10 (so every day is complete). */
function flatModel(over: Partial<HourlyModel> = {}, days = 10): HourlyModel[] {
  const out: HourlyModel[] = []
  for (let d = 1; d <= days; d++) {
    for (let h = 0; h < 24; h++) out.push({ at: hour(d, h), tempC: 20, humidityPct: 50, windKmh: 10, precipMm: 0, ...over })
  }
  return out
}

/** Readings at 00, 08 and 16 UTC on days 1-5, offset from the model by the given amounts. */
function readings(off: { tempC?: number; humidityPct?: number; windKmh?: number; rainMm?: number } = {}, days = 5): StationReading[] {
  const out: StationReading[] = []
  for (let d = 1; d <= days; d++) {
    for (const h of [0, 8, 16]) {
      out.push({ at: hour(d, h), tempC: 20 + (off.tempC ?? 0), humidityPct: 50 + (off.humidityPct ?? 0), windKmh: 10 + (off.windKmh ?? 0), rainMm: off.rainMm ?? 0 })
    }
  }
  return out
}

describe('modelValueAt', () => {
  const m = new Map<number, number>([[Date.parse(hour(1, 0)), 10], [Date.parse(hour(1, 1)), 20]])
  it('is exact on the hour and linear between hours', () => {
    expect(modelValueAt(Date.parse(hour(1, 0)), m)).toBe(10)
    expect(modelValueAt(Date.parse('2026-07-01T00:30:00Z'), m)).toBe(15)
  })
  it('is null rather than a guess when an hour is missing', () => {
    expect(modelValueAt(Date.parse('2026-07-01T01:30:00Z'), m)).toBeNull()
    expect(modelValueAt(Date.parse('2026-07-01T05:00:00Z'), m)).toBeNull()
  })
})

describe('checkStation: temperature, humidity and wind', () => {
  it('agrees when the station tracks the model', () => {
    const r = checkStation(readings({ tempC: 0.5, humidityPct: 3, windKmh: 2 }), flatModel())
    expect(r.temperature).toMatchObject({ verdict: 'agree', n: 15, days: 5, bias: 0.5 })
    expect(r.humidity.verdict).toBe('agree')
    expect(r.wind.verdict).toBe('agree')
    expect(r.provisional).toBe(true)
  })

  it('flags a warm station and explains the likely cause', () => {
    const r = checkStation(readings({ tempC: 3 }), flatModel())
    expect(r.temperature.verdict).toBe('differs')
    expect(r.temperature.message).toMatch(/3 °C higher/)
    expect(r.temperature.message).toMatch(/direct sun/)
  })

  it('flags a cold station, a dry station and a calm station in the right direction', () => {
    expect(checkStation(readings({ tempC: -3 }), flatModel()).temperature.message).toMatch(/cold-air pocket/)
    const humid = checkStation(readings({ humidityPct: -20 }), flatModel()).humidity
    expect(humid.verdict).toBe('differs')
    expect(humid.message).toMatch(/lower than the model/)
    const wind = checkStation(readings({ windKmh: -8 }), flatModel()).wind
    expect(wind.verdict).toBe('differs')
    expect(wind.message).toMatch(/mounted lower than 10 m/)
  })

  it('needs enough readings over enough days before giving a verdict', () => {
    const few = checkStation(readings({}, 2), flatModel())
    expect(few.temperature.verdict).toBe('insufficient')
    expect(few.temperature.message).toMatch(/at least 12 readings over 3 days/)
    expect(checkStation([], flatModel()).temperature.message).toMatch(/No station readings/)
  })

  it('drops implausible readings and readings with no model hour, and counts them', () => {
    const rs: StationReading[] = [...readings(), { at: hour(2, 3), tempC: 200 }, { at: '2026-08-15T03:00:00Z', tempC: 20 }]
    const r = checkStation(rs, flatModel())
    expect(r.temperature.excluded).toEqual({ implausible: 1, noModel: 1 })
    expect(r.temperature.n).toBe(15)
  })

  it('leaves a metric the station does not report as not enough data', () => {
    const tempOnly = readings().map(({ at, tempC }) => ({ at, tempC }))
    const r = checkStation(tempOnly, flatModel())
    expect(r.temperature.verdict).toBe('agree')
    expect(r.humidity.verdict).toBe('insufficient')
    expect(r.wind.verdict).toBe('insufficient')
  })
})

describe('checkStation: rain', () => {
  // Model: rain on days 2, 4, 6 and 8 (1 mm in one hour). Station readings on days 1-8.
  const model = (): HourlyModel[] => flatModel({}, 10).map(h => ({ ...h, precipMm: [2, 4, 6, 8].includes(Number(h.at.slice(8, 10))) && h.at.endsWith('T12:00:00Z') ? 1 : 0 }))
  const stationDays = (wet: number[]): StationReading[] =>
    Array.from({ length: 8 }, (_, i) => i + 1).flatMap(d => [0, 8, 16].map(h => ({ at: hour(d, h), rainMm: wet.includes(d) && h === 8 ? 1 : 0 })))

  it('agrees when rain and dry days line up', () => {
    const r = checkStation(stationDays([2, 4, 6, 8]), model()).rain
    expect(r).toMatchObject({ verdict: 'agree', days: 8, bothWet: 4, bothDry: 4, stationOnly: 0, modelOnly: 0 })
  })

  it('differs when the station keeps missing rain the model has', () => {
    const r = checkStation(stationDays([2]), model()).rain
    expect(r).toMatchObject({ verdict: 'differs', bothWet: 1, modelOnly: 3 })
    expect(r.message).toMatch(/can miss a shower/)
    expect(r.message).toMatch(/Amounts are not compared/)
  })

  it('says a dry spell proves nothing', () => {
    const dryModel = flatModel({}, 10)
    const r = checkStation(stationDays([]), dryModel).rain
    expect(r.verdict).toBe('insufficient')
    expect(r.message).toMatch(/dry spell proves nothing/)
  })

  it('does not compare a day the model has only part of', () => {
    const partial = model().filter(h => !(h.at.startsWith('2026-07-02') && Number(h.at.slice(11, 13)) > 12))
    const r = checkStation(stationDays([2, 4, 6, 8]), partial).rain
    expect(r.days).toBe(7)
  })
})
