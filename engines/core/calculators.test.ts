import { describe, expect, it } from 'vitest'
import { accumulatedInfection, infectionValueForDay, type HourlyWetness, type InfectionModel } from './infection'
import { frostRiskForNight } from './frost'
import { leachingRequirement, relativeYieldPct } from './salinity'
import { annualNutrientDemandKgHa, splitByPhase } from './nutrient-budget'
import { densityCoefficient, kcbFromCover, kcbFull } from './kcb'
import { assessWaterStatus } from './water-status'
import { freshnessOf } from './freshness'
import { barToMPa, cToF, convertTemperature, convertTemperatureDifference, fToC, mPaToBar, windAt2m } from './units'
import { MissingValueError } from '../rules/expression'

describe('infection values', () => {
  // The severity table used by acceptance test A4.6 (temperatures in °F).
  const model: InfectionModel = {
    dryHoursSplit: 2,
    aggregate: 'max',
    bands: [
      { tmin: 59, tmax: 63, steps: [[7, 1], [16, 2], [21, 3]] },
      { tmin: 63, tmax: 68, steps: [[4, 1], [9, 2], [16, 3], [23, 4]] },
      { tmin: 68, tmax: 77, steps: [[3, 1], [6, 2], [13, 3], [21, 4]] },
      { tmin: 77, tmax: 82, steps: [[4, 1], [9, 2], [16, 3], [23, 4]] },
    ],
  }
  const wet = (hours: number, temp: number): HourlyWetness[] => Array.from({ length: hours }, () => ({ temp, wet: true }))
  const dry = (hours: number): HourlyWetness[] => Array.from({ length: hours }, () => ({ temp: 70, wet: false }))

  it('10 wet hours at a mean of 70 °F gives 2', () => {
    expect(infectionValueForDay([...wet(10, 70), ...dry(13)], model)).toBe(2)
  })

  it('22 wet hours at 70 °F gives 4', () => {
    expect(infectionValueForDay([...wet(22, 70), ...dry(1)], model)).toBe(4)
  })

  it('5 wet hours at 60 °F gives 0', () => {
    expect(infectionValueForDay([...wet(5, 60), ...dry(18)], model)).toBe(0)
  })

  it('a short dry gap does not split a wet event', () => {
    expect(infectionValueForDay([...wet(3, 70), ...dry(1), ...wet(3, 70)], model)).toBe(2)
  })

  it('a long dry gap splits events, aggregated as the model says', () => {
    const hours = [...wet(3, 70), ...dry(2), ...wet(3, 70)]
    expect(infectionValueForDay(hours, model)).toBe(1)
    expect(infectionValueForDay(hours, { ...model, aggregate: 'sum' })).toBe(2)
  })

  it('gives 0 with no wetness or outside every band', () => {
    expect(infectionValueForDay(dry(23), model)).toBe(0)
    expect(infectionValueForDay(wet(20, 90), model)).toBe(0)
  })

  it('accumulates over the rolling window and resets after a spray', () => {
    const daily = Array.from({ length: 10 }, (_, i) => ({ date: `2026-05-${String(i + 1).padStart(2, '0')}`, value: 2 }))
    expect(accumulatedInfection(daily, '2026-05-10', 7)).toBe(14)
    expect(accumulatedInfection(daily, '2026-05-10', 7, ['2026-05-07'])).toBe(6)
    expect(accumulatedInfection(daily, '2026-05-10', 7, ['2026-05-20'])).toBe(14)
  })
})

describe('frost risk', () => {
  const single = [{ tempC: -2.5, damageFraction: null }]
  const levels = [
    { tempC: -3, damageFraction: 0.1 },
    { tempC: -5, damageFraction: 0.9 },
  ]
  const base = { uncertaintyC: 1, warningMarginC: 1, watchMarginC: 3 }

  it('returns null when the pack has no critical temperature for the stage', () => {
    expect(frostRiskForNight({ ...base, forecastMinC: -5, critical: [] })).toBeNull()
  })

  it('is critical at or below the critical temperature', () => {
    const r = frostRiskForNight({ ...base, forecastMinC: -2.5, critical: single })
    expect(r?.level).toBe('critical')
    expect(r?.marginC).toBe(0)
  })

  it('is a warning when the cold end of the forecast is within the warning margin', () => {
    expect(frostRiskForNight({ ...base, forecastMinC: -0.6, critical: single })?.level).toBe('warning')
  })

  it('is a watch within the watch margin, and none beyond it', () => {
    expect(frostRiskForNight({ ...base, forecastMinC: 1, critical: single })?.level).toBe('watch')
    expect(frostRiskForNight({ ...base, forecastMinC: 4, critical: single })?.level).toBe('none')
  })

  it('cannot estimate damage from a single tolerance value', () => {
    const r = frostRiskForNight({ ...base, forecastMinC: -4, critical: single })
    expect(r?.damageFraction).toBeNull()
    expect(r?.damageNote).toMatch(/fewer than two/)
  })

  it('interpolates damage linearly between two levels', () => {
    expect(frostRiskForNight({ ...base, forecastMinC: -4, critical: levels })?.damageFraction).toBeCloseTo(0.5, 10)
    expect(frostRiskForNight({ ...base, forecastMinC: -3, critical: levels })?.damageFraction).toBeCloseTo(0.1, 10)
  })

  it('holds the coldest level below it and does not extrapolate above the mildest', () => {
    expect(frostRiskForNight({ ...base, forecastMinC: -8, critical: levels })?.damageFraction).toBe(0.9)
    const mild = frostRiskForNight({ ...base, forecastMinC: -2, critical: levels })
    expect(mild?.damageFraction).toBeNull()
    expect(mild?.damageNote).toMatch(/warmer than the mildest/)
  })

  it('judges the level against the warmest critical temperature, whatever the order', () => {
    expect(frostRiskForNight({ ...base, forecastMinC: -3.2, critical: [...levels].reverse() })?.criticalC).toBe(-3)
  })
})

describe('salinity', () => {
  // Acceptance tests A4.8.
  it('a = 1.5, b = 19, ECe = 3.0 gives 71.5 %', () => {
    expect(relativeYieldPct(3.0, 1.5, 19)).toBeCloseTo(71.5, 10)
  })

  it('ECw = 1.2 with a target of 1.5 gives a leaching requirement of about 0.19', () => {
    expect(leachingRequirement(1.2, 1.5)).toBeCloseTo(0.19, 2)
  })

  it('holds relative yield between 0 and 100', () => {
    expect(relativeYieldPct(1.0, 1.5, 19)).toBe(100)
    expect(relativeYieldPct(20, 1.5, 19)).toBe(0)
  })

  it('refuses water too saline for the target', () => {
    expect(() => leachingRequirement(7.5, 1.5)).toThrow(/too saline/)
  })
})

describe('nutrient budget', () => {
  it('demand = (yield x removal + growth - credits) / efficiency', () => {
    expect(
      annualNutrientDemandKgHa({ expectedYieldKgHa: 2000, removalKgPerKg: 0.068, growthKgHa: 10, creditsKgHa: 20, efficiency: 0.7 }),
    ).toBeCloseTo((136 + 10 - 20) / 0.7, 8)
  })

  it('is never negative', () => {
    expect(annualNutrientDemandKgHa({ expectedYieldKgHa: 100, removalKgPerKg: 0.068, creditsKgHa: 50, efficiency: 0.7 })).toBe(0)
  })

  it('rejects an efficiency outside 0-1', () => {
    expect(() => annualNutrientDemandKgHa({ expectedYieldKgHa: 100, removalKgPerKg: 0.068, efficiency: 0 })).toThrow()
  })

  it('splits by phase shares that sum to 1', () => {
    expect(splitByPhase(100, { a: 0.2, b: 0.3, c: 0.3, d: 0.2 })).toEqual({ a: 20, b: 30, c: 30, d: 20 })
    expect(() => splitByPhase(100, { a: 0.2, b: 0.3 })).toThrow(/sum to 1/)
  })
})

describe('Kcb from cover and height', () => {
  it('density coefficient is the smallest of 1, ML x fc and fc^(1/(1+h))', () => {
    expect(densityCoefficient({ fcEff: 0.1, heightM: 2, ml: 1.5 })).toBeCloseTo(0.15, 10)
    expect(densityCoefficient({ fcEff: 0.5, heightM: 3, ml: 2 })).toBeCloseTo(Math.pow(0.5, 0.25), 10)
    expect(densityCoefficient({ fcEff: 1, heightM: 4, ml: 1.5 })).toBe(1)
  })

  it('full-cover Kcb is min(1 + 0.1 h, 1.2) under standard climate, scaled by Fr', () => {
    expect(kcbFull({ heightM: 1, fr: 1 })).toBeCloseTo(1.1, 10)
    expect(kcbFull({ heightM: 4, fr: 1 })).toBeCloseTo(1.2, 10)
    expect(kcbFull({ heightM: 4, fr: 0.8 })).toBeCloseTo(0.96, 10)
  })

  it('rises with cover from the bare-soil minimum to the full-cover value', () => {
    const at = (fcEff: number) => kcbFromCover({ fcEff, heightM: 4, ml: 1.5, fr: 1, kcMin: 0.15 })
    expect(at(0)).toBeCloseTo(0.15, 10)
    expect(at(1)).toBeCloseTo(1.2, 10)
    expect(at(0.2)).toBeLessThan(at(0.4))
    expect(at(0.4)).toBeLessThan(at(0.8))
  })

  it('starts from the ground cover Kcb when there is one', () => {
    const r = kcbFromCover({ fcEff: 0.3, heightM: 4, ml: 1.5, fr: 1, kcMin: 0.15, kcbCover: 0.6 })
    expect(r).toBeGreaterThan(0.6)
    expect(r).toBeLessThan(1.2)
  })

  it('rejects cover outside 0-1', () => {
    expect(() => densityCoefficient({ fcEff: 1.2, heightM: 2, ml: 1.5 })).toThrow()
  })
})

describe('plant water status', () => {
  const model = { indicator: 'stem_water_potential', unit: 'bar', baselineExpression: '-(air_temp_F / $divisor)' }

  it('returns the baseline and the deviation from it', () => {
    const r = assessWaterStatus(-12.5, model, { air_temp_F: 90 }, { divisor: 10 })
    expect(r.baseline).toBeCloseTo(-9, 10)
    expect(r.deviation).toBeCloseTo(-3.5, 10)
    expect(r.reducedConfidence).toBe(false)
  })

  it('falls back to absolute thresholds with reduced confidence when the pack has no baseline', () => {
    const r = assessWaterStatus(-12.5, { ...model, baselineExpression: null }, {}, {})
    expect(r).toMatchObject({ baseline: null, deviation: null, basis: 'absolute', reducedConfidence: true })
  })

  it('says which weather input is missing', () => {
    expect(() => assessWaterStatus(-12, model, {}, { divisor: 10 })).toThrow(MissingValueError)
  })
})

describe('freshness', () => {
  const now = new Date('2026-10-09T12:00:00Z')
  const v = (observedAt: string | null, state: 'KNOWN' | 'ESTIMATED' | 'STALE' = 'KNOWN') =>
    ({ value: 1, unit: 'mm', source: 'sensor' as const, observedAt, state })

  it('reports the age of the oldest input and the weakest state', () => {
    const f = freshnessOf([v('2026-10-09T06:00:00Z'), v('2026-10-08T12:00:00Z', 'ESTIMATED')], now)
    expect(f.ageHours).toBe(24)
    expect(f.oldestObservedAt).toBe('2026-10-08T12:00:00.000Z')
    expect(f.weakestState).toBe('ESTIMATED')
  })

  it('cannot give an age when an input has no observation time', () => {
    expect(freshnessOf([v('2026-10-09T06:00:00Z'), v(null, 'STALE')], now)).toMatchObject({ ageHours: null, weakestState: 'STALE' })
  })

  it('is unknown with no inputs', () => {
    expect(freshnessOf([], now)).toEqual({ oldestObservedAt: null, ageHours: null, weakestState: 'UNKNOWN' })
  })
})

describe('units', () => {
  it('round-trips temperatures', () => {
    expect(cToF(0)).toBe(32)
    expect(fToC(cToF(21.5))).toBeCloseTo(21.5, 10)
    expect(convertTemperature(50, 'F', 'C')).toBe(10)
    expect(convertTemperature(10, 'C', 'C')).toBe(10)
  })

  it('converts differences without the offset', () => {
    expect(convertTemperatureDifference(10, 'C', 'F')).toBe(18)
    expect(convertTemperatureDifference(18, 'F', 'C')).toBe(10)
  })

  it('1 MPa = 10 bar', () => {
    expect(mPaToBar(-1.5)).toBe(-15)
    expect(barToMPa(-15)).toBe(-1.5)
  })

  it('leaves a 2 m wind unchanged and lowers a 10 m wind (FAO-56 Eq. 47)', () => {
    expect(windAt2m(3, 2)).toBeCloseTo(3, 2)
    expect(windAt2m(3.2, 10)).toBeCloseTo(2.4, 1)
  })
})
