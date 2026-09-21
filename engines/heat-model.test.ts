import { describe, expect, it } from 'vitest'
import { ALMOND_HEAT_MODEL, heatModelFor, inferGrowthStage } from './heat-model'
import { dailyGDD, predictSeasonDates, seasonToDate, sumGDD, type MonthlyNormalTemps } from '@/utils/agronomic'

// The function the cron used before the model moved into the crop registry, kept
// here verbatim so the refactor is proven not to change any almond stage.
function legacyInferGrowthStage(cumulativeGdd: number, month: number): string {
  if (month === 11 || month === 12 || month === 1) return 'dormancy'
  if (month === 10) return 'post-harvest'
  if (cumulativeGdd < 50) return 'bud-swell'
  if (cumulativeGdd < 150) return 'bud-break'
  if (cumulativeGdd < 300) return 'bloom'
  if (cumulativeGdd < 500) return 'petal-fall'
  if (cumulativeGdd < 1600) return 'nut-development'
  if (cumulativeGdd < 2100) return 'hull-split'
  return 'harvest'
}

describe('heatModelFor', () => {
  it('finds the almond model by any of the crop names', () => {
    expect(heatModelFor('Almond')).toBe(ALMOND_HEAT_MODEL)
    expect(heatModelFor('Badem')).toBe(ALMOND_HEAT_MODEL)
    expect(heatModelFor('almendro')).toBe(ALMOND_HEAT_MODEL)
  })

  it('returns no model for other crops, unknown crops and blocks with no crop', () => {
    expect(heatModelFor('Pistachio')).toBeNull()
    expect(heatModelFor('Valencia orange')).toBeNull()
    expect(heatModelFor('')).toBeNull()
    expect(heatModelFor(null)).toBeNull()
    expect(heatModelFor(undefined)).toBeNull()
  })

  it('says the almond numbers are provisional', () => {
    expect(ALMOND_HEAT_MODEL.provisional).toBe(true)
    expect(ALMOND_HEAT_MODEL.note).toMatch(/Provisional/)
    expect(ALMOND_HEAT_MODEL.baseC).toBe(7.2)
  })
})

describe('inferGrowthStage', () => {
  it('gives exactly the stages the cron gave before, for every month and a sweep of GDD', () => {
    for (let month = 1; month <= 12; month++) {
      for (let gdd = 0; gdd <= 2600; gdd += 5) {
        expect(inferGrowthStage(ALMOND_HEAT_MODEL, gdd, month)).toBe(legacyInferGrowthStage(gdd, month))
      }
    }
  })

  it('is dormant Nov-Jan and post-harvest in October whatever the heat', () => {
    expect(inferGrowthStage(ALMOND_HEAT_MODEL, 2400, 12)).toBe('dormancy')
    expect(inferGrowthStage(ALMOND_HEAT_MODEL, 2400, 1)).toBe('dormancy')
    expect(inferGrowthStage(ALMOND_HEAT_MODEL, 100, 10)).toBe('post-harvest')
  })

  it('steps through the stages at the thresholds', () => {
    const at = (gdd: number) => inferGrowthStage(ALMOND_HEAT_MODEL, gdd, 4)
    expect([at(49), at(50), at(149), at(150), at(299), at(300), at(499), at(500)]).toEqual([
      'bud-swell', 'bud-break', 'bud-break', 'bloom', 'bloom', 'petal-fall', 'petal-fall', 'nut-development',
    ])
    expect([at(1599), at(1600), at(2099), at(2100)]).toEqual(['nut-development', 'hull-split', 'hull-split', 'harvest'])
  })
})

describe('the GDD base is a parameter, defaulting to almond 7.2', () => {
  it('counts heat above the base it is given', () => {
    expect(dailyGDD(20, 10)).toBe(7.8) // mean 15, base 7.2
    expect(dailyGDD(20, 10, 10)).toBe(5) // mean 15, base 10
    expect(dailyGDD(20, 10, 15)).toBe(0)
  })

  it('carries the base through sums, season totals and projections', () => {
    const days = [{ tMax: 20, tMin: 10 }, { tMax: 20, tMin: 10 }]
    expect(sumGDD(days)).toBe(15.6)
    expect(sumGDD(days, 10)).toBe(10)

    const history = [{ date: '2026-04-01', tMax: 20, tMin: 10 }, { date: '2026-04-02', tMax: 20, tMin: 10 }]
    expect(seasonToDate(history, '2026-01-01', '2025-10-01').gdd).toBe(15.6)
    expect(seasonToDate(history, '2026-01-01', '2025-10-01', 10).gdd).toBe(10)

    // A higher base accumulates heat more slowly, so the same target is reached later.
    const normals: MonthlyNormalTemps[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, avg_high_c: 24, avg_low_c: 12 }))
    const today = new Date('2026-05-01T12:00:00')
    const base72 = predictSeasonDates(today, 0, normals)
    const base10 = predictSeasonDates(today, 0, normals, false, undefined, 10)
    expect(base10.hullSplitDate!.getTime()).toBeGreaterThan(base72.hullSplitDate!.getTime())
  })

  it('shifts targets by the model bud-break offset when the anchor is bud break', () => {
    const normals: MonthlyNormalTemps[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, avg_high_c: 24, avg_low_c: 12 }))
    const today = new Date('2026-05-01T12:00:00')
    const bloomAnchor = predictSeasonDates(today, 100, normals, false)
    const budAnchorDefault = predictSeasonDates(today, 100, normals, true)
    const budAnchorLongGap = predictSeasonDates(today, 100, normals, true, undefined, 7.2, 400)
    expect(budAnchorDefault.hullSplitDate!.getTime()).toBeGreaterThan(bloomAnchor.hullSplitDate!.getTime())
    expect(budAnchorLongGap.hullSplitDate!.getTime()).toBeGreaterThan(budAnchorDefault.hullSplitDate!.getTime())
  })
})
