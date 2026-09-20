import { describe, expect, it } from 'vitest'
import { evaluateFrostRisk, frostThresholdFor } from './weather-risk'

const fc = (...mins: number[]) => mins.map((tMin, i) => ({ date: `2026-04-${10 + i}`, tMin }))

describe('frostThresholdFor', () => {
  it('uses the measured values for Vairo at bloom (Calle et al. 2025)', () => {
    expect(frostThresholdFor('bloom', 'Vairo')).toMatchObject({ lt10: -3.46, lt50: -4.85, lt90: -6.25, basis: 'variety_tested' })
  })

  it('is case- and whitespace-insensitive on the variety', () => {
    expect(frostThresholdFor('bloom', '  vairo ')?.basis).toBe('variety_tested')
  })

  it('falls back to the species mean for Makako and says it was not tested', () => {
    const t = frostThresholdFor('bloom', 'Makako')
    expect(t?.basis).toBe('species_mean')
    expect(t?.lt10).toBe(-3.21)
    expect(t?.caveat).toMatch(/Makako was not among the 20 cultivars tested/)
  })

  it('falls back to the species mean when the variety is unknown', () => {
    expect(frostThresholdFor('bloom', null)?.caveat).toMatch(/Variety unknown/)
  })

  it('uses species-level fruitlet values, less tolerant than bloom', () => {
    const t = frostThresholdFor('fruit_set', 'Vairo')
    expect(t).toMatchObject({ lt10: -2.4, lt50: null, lt90: -3.6, basis: 'species_stage' })
  })

  it('has no threshold outside bloom and fruit set', () => {
    expect(frostThresholdFor('dormant', 'Vairo')).toBeNull()
  })
})

describe('evaluateFrostRisk', () => {
  it('is not applicable outside assessed stages', () => {
    const r = evaluateFrostRisk('dormant', fc(-8), { variety: 'Vairo' })
    expect(r.applicable).toBe(false)
    expect(r.level).toBe('none')
  })

  it('does not guess when the stage is unknown', () => {
    const r = evaluateFrostRisk(null, fc(-8))
    expect(r.applicable).toBe(false)
    expect(r.notes[0]).toMatch(/unknown/i)
  })

  it('is critical at or below the variety LT10 and reports the damage band', () => {
    const r = evaluateFrostRisk('bloom', fc(3, -3.5, 4), { variety: 'Vairo' })
    expect(r.level).toBe('critical')
    expect(r.worstDay).toMatchObject({ date: '2026-04-11', band: 'lt10' })
  })

  it('reports deeper bands as the forecast falls past LT50 and LT90', () => {
    expect(evaluateFrostRisk('bloom', fc(-5), { variety: 'Vairo' }).worstDay?.band).toBe('lt50')
    expect(evaluateFrostRisk('bloom', fc(-6.3), { variety: 'Vairo' }).worstDay?.band).toBe('lt90')
  })

  it('treats the same forecast differently for a tested and an untested variety', () => {
    // -3.3 °C is above Vairo's LT10 (-3.46) but below the species mean (-3.21)
    expect(evaluateFrostRisk('bloom', fc(-3.3), { variety: 'Vairo' }).level).toBe('warning')
    expect(evaluateFrostRisk('bloom', fc(-3.3), { variety: 'Makako' }).level).toBe('critical')
  })

  it('warns when the forecast error margin could reach the threshold', () => {
    expect(evaluateFrostRisk('bloom', fc(-2), { variety: 'Vairo' }).level).toBe('warning')
  })

  it('watches when within twice the margin', () => {
    expect(evaluateFrostRisk('bloom', fc(0), { variety: 'Vairo' }).level).toBe('watch')
  })

  it('is clear on a mild forecast', () => {
    const r = evaluateFrostRisk('bloom', fc(6, 8, 7), { variety: 'Vairo' })
    expect(r.level).toBe('none')
    expect(r.worstDay).toBeNull()
  })

  it('is stricter at fruit set than at bloom for the same forecast', () => {
    expect(evaluateFrostRisk('fruit_set', fc(-2.5), { variety: 'Vairo' }).level).toBe('critical')
    expect(evaluateFrostRisk('bloom', fc(-2.5), { variety: 'Vairo' }).level).toBe('warning')
  })

  it('reports the forecast range, not a single number', () => {
    const r = evaluateFrostRisk('bloom', fc(0), { variety: 'Vairo' })
    expect(r.days[0].tMinLow).toBe(-2)
    expect(r.days[0].tMinHigh).toBe(2)
  })

  it('always carries the lab caveat, and flags values not measured for the variety', () => {
    const vairo = evaluateFrostRisk('bloom', fc(-1), { variety: 'Vairo' })
    expect(vairo.notes.join(' ')).toMatch(/cut branches/)
    expect(vairo.notes.join(' ')).not.toMatch(/Not a value measured/)
    const makako = evaluateFrostRisk('bloom', fc(-1), { variety: 'Makako' })
    expect(makako.notes.join(' ')).toMatch(/Not a value measured for this variety/)
  })
})
