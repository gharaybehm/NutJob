import { describe, expect, it } from 'vitest'
import { dailyGDD, daysInclusive, hargreavesETo, seasonToDate, sevenDayWaterDeficit } from './agronomic'

// Sultanhanı, Aksaray is about 38.2 °N.
const LAT = 38.24

describe('hargreavesETo', () => {
  it('gives realistic reference ET for Central Anatolia across the year', () => {
    const jan = hargreavesETo(4, -5, LAT, 15)
    const apr = hargreavesETo(18, 4, LAT, 102)
    const jul = hargreavesETo(34, 15, LAT, 196)
    // Regression: a missing mm/day conversion once gave 17.3 mm/day in July.
    expect(jan).toBeGreaterThan(0.3)
    expect(jan).toBeLessThan(1.5)
    expect(apr).toBeGreaterThan(2.5)
    expect(apr).toBeLessThan(5)
    expect(jul).toBeGreaterThan(5.5)
    expect(jul).toBeLessThan(9)
  })

  it('rises with the daily temperature range and with the mean temperature', () => {
    expect(hargreavesETo(34, 15, LAT, 196)).toBeGreaterThan(hargreavesETo(28, 15, LAT, 196))
    expect(hargreavesETo(34, 15, LAT, 196)).toBeGreaterThan(hargreavesETo(30, 11, LAT, 196))
  })

  it('is zero without a temperature range and never negative', () => {
    expect(hargreavesETo(10, 10, LAT, 100)).toBe(0)
    expect(hargreavesETo(-5, -10, LAT, 15)).toBeGreaterThanOrEqual(0)
  })
})

describe('sevenDayWaterDeficit', () => {
  it('is demand minus rain, so rain lowers the deficit', () => {
    const dry = Array.from({ length: 7 }, () => ({ temp_max: 34, temp_min: 15, precipitation_mm: 0 }))
    const wet = dry.map(d => ({ ...d, precipitation_mm: 2 }))
    expect(sevenDayWaterDeficit(dry, LAT, 196)).toBeCloseTo(sevenDayWaterDeficit(wet, LAT, 196) + 14, 0)
  })
})

describe('dailyGDD', () => {
  it('uses base 7.2 °C and never goes below zero', () => {
    expect(dailyGDD(20, 10)).toBe(7.8)
    expect(dailyGDD(6, 0)).toBe(0)
  })
})

describe('seasonToDate', () => {
  const day = (date: string, tMax: number, tMin: number) => ({ date, tMax, tMin })

  it('counts heat only from the GDD start and chill only from the chill start', () => {
    const history = [
      day('2025-11-10', 8, 0), // chill season, before Jan 1
      day('2026-01-10', 20, 10), // GDD 7.8
      day('2026-02-10', 20, 10), // GDD 7.8
    ]
    const t = seasonToDate(history, '2026-01-01', '2025-10-01')
    expect(t.gdd).toBe(15.6)
    // Nov 10 (8/0): 7.2/8 of the day below 7.2 °C = 21.6 h. The two Jan/Feb days never drop below it.
    expect(t.chillHours).toBe(21.6)
  })

  it('reaches a realistic season total from a full Central Anatolian year of daily data', () => {
    // 240 days from 1 March at 26/12 (11.8 GDD/day) is about 2800, not the ~120 the
    // old running sum gave a farm whose job started in September.
    const history = Array.from({ length: 240 }, (_, i) =>
      day(new Date(Date.UTC(2026, 2, 1 + i)).toISOString().slice(0, 10), 26, 12),
    )
    expect(seasonToDate(history, '2026-01-01', '2025-10-01').gdd).toBeGreaterThan(2500)
  })

  it('is zero for an empty history', () => {
    expect(seasonToDate([], '2026-01-01', '2025-10-01')).toEqual({ gdd: 0, chillHours: 0 })
  })
})

describe('daysInclusive', () => {
  it('counts both end days', () => {
    expect(daysInclusive('2026-01-01', '2026-01-01')).toBe(1)
    expect(daysInclusive('2026-01-01', '2026-01-10')).toBe(10)
    expect(daysInclusive('2026-01-10', '2026-01-01')).toBe(0)
  })
})
