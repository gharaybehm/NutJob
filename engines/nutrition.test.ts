import { describe, expect, it } from 'vitest'
import { assessLeafSample, describeLeafAssessment, judgeLeafValue, leafFormFields, leafReferenceFor, ALMOND_LEAF_REFERENCE } from './nutrition'
import { assessMaturity } from './maturity'

const band = (key: string) => ALMOND_LEAF_REFERENCE.bands.find(b => b.key === key)!

describe('judgeLeafValue', () => {
  it('splits nitrogen into deficient, marginal, adequate and high (hull-rot ceiling 2.6)', () => {
    expect(judgeLeafValue(band('n'), 1.9)).toBe('deficient')
    expect(judgeLeafValue(band('n'), 2.1)).toBe('marginal')
    expect(judgeLeafValue(band('n'), 2.2)).toBe('adequate')
    expect(judgeLeafValue(band('n'), 2.6)).toBe('adequate')
    expect(judgeLeafValue(band('n'), 2.7)).toBe('high')
  })

  it('treats a ceiling-only nutrient as adequate until it passes the ceiling', () => {
    expect(judgeLeafValue(band('cl'), 0.05)).toBe('adequate')
    expect(judgeLeafValue(band('cl'), 0.31)).toBe('high')
  })

  it('has no marginal step where deficiency and adequacy start together', () => {
    expect(judgeLeafValue(band('zn'), 14.9)).toBe('deficient')
    expect(judgeLeafValue(band('zn'), 15)).toBe('adequate')
  })
})

describe('leafReferenceFor', () => {
  it('finds almond by any of its names and refuses other crops', () => {
    expect(leafReferenceFor('Badem')?.crop).toBe('almond')
    expect(leafReferenceFor('Pistachio')).toBeNull()
    expect(leafReferenceFor(null)).toBeNull()
  })
})

describe('assessLeafSample', () => {
  const july = '2026-07-20'

  it('judges a July sample and takes the worst status', () => {
    const a = assessLeafSample({ cropType: 'almond', sampledAt: july, values: { n: 2.4, k: 0.8, b: 40 } })
    expect(a.supported).toBe(true)
    expect(a.inWindow).toBe(true)
    expect(a.results.map(r => [r.symbol, r.status])).toEqual([['N', 'adequate'], ['K', 'deficient'], ['B', 'adequate']])
    expect(a.worst).toBe('deficient')
  })

  it('flags nitrogen over 2.6% as high', () => {
    const a = assessLeafSample({ cropType: 'almond', sampledAt: july, values: { n: 2.9 } })
    expect(a.results[0]).toMatchObject({ status: 'high' })
    expect(describeLeafAssessment(a).join(' ')).toMatch(/hull rot/)
  })

  it('says a sample outside the window is indicative only', () => {
    const a = assessLeafSample({ cropType: 'almond', sampledAt: '2026-04-10', values: { n: 2.4 } })
    expect(a.inWindow).toBe(false)
    expect(a.cautions.join(' ')).toMatch(/outside the reference window/)
  })

  it('gives no judgement to a crop with no reference', () => {
    const a = assessLeafSample({ cropType: 'Pistachio', sampledAt: july, values: { n: 2.4 } })
    expect(a).toMatchObject({ supported: false, results: [], worst: null })
    expect(a.cautions[0]).toMatch(/No leaf-tissue reference is loaded for "Pistachio"/)
  })

  it('lists a nutrient with no band as not judged, with the reason', () => {
    const a = assessLeafSample({ cropType: 'almond', sampledAt: july, values: { fe: 90, ca: 2 } })
    expect(a.results).toEqual([])
    expect(a.unjudged.map(u => u.symbol).sort()).toEqual(['Ca', 'Fe'])
  })

  it('ignores blanks and non-numbers, and unknown keys', () => {
    const a = assessLeafSample({ cropType: 'almond', sampledAt: july, values: { n: '', p: null, k: NaN, zz: 4 } })
    expect(a.results).toEqual([])
    expect(a.unjudged).toEqual([])
  })

  it('warns that the bands are for bearing trees when the block is not bearing', () => {
    const maturity = assessMaturity({ plantingDate: '2025-11-15', now: new Date('2026-07-20T00:00:00Z') })
    const a = assessLeafSample({ cropType: 'almond', sampledAt: july, values: { n: 2.4 }, maturity })
    expect(a.cautions.join(' ')).toMatch(/for bearing almond trees/)
  })

  it('marks the almond bands provisional', () => {
    const a = assessLeafSample({ cropType: 'almond', sampledAt: july, values: { n: 2.4 } })
    expect(a.cautions.join(' ')).toMatch(/provisional/)
  })
})

describe('leafFormFields', () => {
  it('lists every almond nutrient in display order, and none for another crop', () => {
    expect(leafFormFields('almond').map(f => f.key)).toEqual(['n', 'p', 'k', 'ca', 'mg', 'b', 'zn', 'mn', 'cu', 'fe', 'na', 'cl'])
    expect(leafFormFields('Walnut')).toEqual([])
  })
})
