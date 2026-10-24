import { describe, expect, it } from 'vitest'
import { estimateWaterLimits } from './soil-hydraulics'

/**
 * Saxton & Rawls 2006, Table 3: field capacity (33 kPa) and wilting point
 * (1500 kPa) by texture class at 2.5 % organic matter, rounded to whole %.
 */
const TABLE_3 = [
  { texture: 'sand', sand: 88, clay: 5, wp: 5, fc: 10 },
  { texture: 'loamy sand', sand: 80, clay: 5, wp: 5, fc: 12 },
  { texture: 'sandy loam', sand: 65, clay: 10, wp: 8, fc: 18 },
  { texture: 'loam', sand: 40, clay: 20, wp: 14, fc: 28 },
  { texture: 'silt loam', sand: 20, clay: 15, wp: 11, fc: 31 },
  { texture: 'sandy clay loam', sand: 60, clay: 25, wp: 17, fc: 27 },
  { texture: 'clay loam', sand: 30, clay: 35, wp: 22, fc: 36 },
  { texture: 'silty clay', sand: 10, clay: 45, wp: 27, fc: 41 },
  { texture: 'clay', sand: 20, clay: 50, wp: 30, fc: 42 },
]

describe('estimateWaterLimits', () => {
  it.each(TABLE_3)('matches the paper for $texture', ({ sand, clay, wp, fc }) => {
    const r = estimateWaterLimits({ sandPct: sand, clayPct: clay, organicMatterPct: 2.5 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(Math.abs(r.fieldCapacityPct - fc)).toBeLessThanOrEqual(1)
    expect(Math.abs(r.wiltingPointPct - wp)).toBeLessThanOrEqual(1)
  })

  it('gives one decimal and names its source', () => {
    const r = estimateWaterLimits({ sandPct: 40, clayPct: 20, organicMatterPct: 2.5 })
    expect(r).toMatchObject({ ok: true, fieldCapacityPct: 28, wiltingPointPct: 13.7 })
    if (r.ok) expect(r.source).toMatch(/Saxton & Rawls 2006/)
  })

  it('assumes no organic matter when the test has none', () => {
    expect(estimateWaterLimits({ sandPct: 40, clayPct: 20, organicMatterPct: null })).toEqual({ ok: false, reason: 'missing_organic_matter' })
  })

  it('reports which texture value is missing', () => {
    expect(estimateWaterLimits({ sandPct: null, clayPct: 20, organicMatterPct: 2 })).toEqual({ ok: false, reason: 'missing_sand' })
    expect(estimateWaterLimits({ sandPct: 40, clayPct: null, organicMatterPct: 2 })).toEqual({ ok: false, reason: 'missing_clay' })
  })

  it('refuses a texture that does not add up', () => {
    expect(estimateWaterLimits({ sandPct: 70, clayPct: 40, organicMatterPct: 2 })).toEqual({ ok: false, reason: 'invalid_texture' })
    expect(estimateWaterLimits({ sandPct: -1, clayPct: 20, organicMatterPct: 2 })).toEqual({ ok: false, reason: 'invalid_texture' })
  })

  it('refuses soils outside the fitted range instead of stretching the equations', () => {
    expect(estimateWaterLimits({ sandPct: 10, clayPct: 65, organicMatterPct: 2 })).toEqual({ ok: false, reason: 'outside_fitted_range' })
    expect(estimateWaterLimits({ sandPct: 40, clayPct: 20, organicMatterPct: 9 })).toEqual({ ok: false, reason: 'outside_fitted_range' })
  })
})
