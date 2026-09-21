import { describe, expect, it } from 'vitest'
import { assessMaturity, expectsCrop, YOUNG_ORCHARD_SCHEDULE } from './maturity'

const now = new Date('2026-09-21T12:00:00Z')

describe('assessMaturity', () => {
  it('treats a Q4 2025 planting as first leaf in 2026 and not bearing', () => {
    const m = assessMaturity({ plantingDate: '2025-11-15', now })
    expect(m).toMatchObject({ class: 'non_bearing', leafYear: 1, ageMonths: 10, assumed: false, plantingDate: '2025-11-15' })
    expect(m.label).toBe('Leaf year 1, not bearing yet')
    expect(expectsCrop(m)).toBe(false)
  })

  it('reads a year alone as the last quarter and says so', () => {
    const m = assessMaturity({ plantingYear: 2025, now })
    expect(m).toMatchObject({ class: 'non_bearing', leafYear: 1, assumed: true, plantingDate: '2025-11-01' })
    expect(m.notes.join(' ')).toMatch(/last quarter/)
  })

  it('prefers an exact date over the year', () => {
    expect(assessMaturity({ plantingDate: '2024-04-10', plantingYear: 2025, now }).assumed).toBe(false)
  })

  it('counts a spring planting in the same year as leaf year 1', () => {
    expect(assessMaturity({ plantingDate: '2026-03-01', now }).leafYear).toBe(1)
    expect(assessMaturity({ plantingDate: '2024-04-10', now }).leafYear).toBe(3)
  })

  it('counts August or later plantings from the following spring', () => {
    expect(assessMaturity({ plantingDate: '2025-08-20', now }).leafYear).toBe(1)
    expect(assessMaturity({ plantingDate: '2025-07-20', now }).leafYear).toBe(2)
  })

  it('reaches young bearing in leaf year 3, with the schedule shares from Table A', () => {
    const m = assessMaturity({ plantingDate: '2023-11-10', now }) // first leaf 2024, so leaf year 3 in 2026
    expect(m).toMatchObject({ class: 'young_bearing', leafYear: 3 })
    expect(m.waterFraction).toBe(0.5) // 26 / 52
    expect(m.yieldFraction).toBe(0.21) // 600 / 2800
    expect(m.nFraction).toBe(0.32) // 80 / 250
    expect(expectsCrop(m)).toBe(true)
  })

  it('uses the water share of each leaf year', () => {
    expect(assessMaturity({ plantingDate: '2025-11-01', now }).waterFraction).toBe(0.1) // 5 / 52
    expect(assessMaturity({ plantingDate: '2024-11-01', now }).waterFraction).toBe(0.31) // 16 / 52
    expect(assessMaturity({ plantingDate: '2022-11-01', now }).waterFraction).toBe(0.9) // 47 / 52
    expect(assessMaturity({ plantingDate: '2021-11-01', now }).waterFraction).toBe(1) // 52 / 52, leaf year 5
  })

  it('is mature from leaf year 6 with full shares', () => {
    const m = assessMaturity({ plantingDate: '2020-11-01', now })
    expect(m).toMatchObject({ class: 'mature', leafYear: 6, waterFraction: 1, yieldFraction: 1, nFraction: 1 })
    expect(assessMaturity({ plantingYear: 2006, now })).toMatchObject({ class: 'mature', assumed: true })
  })

  it('reports not planted for a future date', () => {
    const m = assessMaturity({ plantingDate: '2027-01-15', now })
    expect(m.class).toBe('not_planted')
    expect(m.waterFraction).toBe(0)
    expect(expectsCrop(m)).toBe(false)
  })

  it('does not guess when nothing is recorded', () => {
    const m = assessMaturity({ now })
    expect(m).toMatchObject({ class: 'unknown', leafYear: null, waterFraction: 1 })
    expect(m.notes[0]).toMatch(/not recorded/)
    expect(assessMaturity({ plantingDate: 'garbage', plantingYear: null, now }).class).toBe('unknown')
  })

  it('carries its source and the caveat for young blocks only', () => {
    const young = assessMaturity({ plantingYear: 2025, now })
    expect(young.source).toBe(YOUNG_ORCHARD_SCHEDULE.source)
    expect(young.notes.join(' ')).toMatch(/California/)
    expect(assessMaturity({ plantingYear: 2006, now }).notes.join(' ')).not.toMatch(/California/)
  })
})

describe('crops without a tree-age schedule', () => {
  it('does not apply the almond schedule to another crop', () => {
    const m = assessMaturity({ plantingDate: '2025-11-15', cropType: 'Pistachio', now })
    expect(m).toMatchObject({ class: 'unknown', waterFraction: 1, yieldFraction: 1 })
    expect(m.label).toMatch(/No tree-age schedule/)
    expect(m.notes[0]).toMatch(/"Pistachio"/)
  })

  it('reads almond under any of its names, and by default', () => {
    expect(assessMaturity({ plantingDate: '2025-11-15', cropType: 'Badem', now }).class).toBe('non_bearing')
    expect(assessMaturity({ plantingDate: '2025-11-15', now }).class).toBe('non_bearing')
  })

  it('treats a block with no crop recorded as having no schedule', () => {
    expect(assessMaturity({ plantingDate: '2025-11-15', cropType: null, now }).class).toBe('unknown')
  })
})
