import { describe, expect, it } from 'vitest'
import { parseNSplit, nitrogenBudget, nitrogenApplied, describeNitrogenBudget, DEFAULT_KERNEL_TARGET_KG_HA } from './nitrogen'

const now = new Date('2026-07-01T12:00:00Z')
const mature = { cropType: 'almond', plantingYear: 2005, areaHa: 10, now }

describe('nitrogenBudget', () => {
  it('scales the UC 250 lb N/ac by the yield target for a mature block', () => {
    const b = nitrogenBudget(mature)
    expect(DEFAULT_KERNEL_TARGET_KG_HA).toBe(2500)
    expect(b.supported).toBe(true)
    expect(b.nKgHa).toBeCloseTo(223.2, 0) // 250 lb/ac = 280.2 kg/ha, x 2500 / 3138.4
    expect(b.nKgBlock).toBeCloseTo(b.nKgHa! * 10, 0)
    expect(b.ureaKgHa).toBeCloseTo(b.nKgHa! / 0.46, 0)
    expect(b.yieldTargetKgHa).toBe(2500)
  })

  it('gives the UC schedule figure for a young block and ignores the mature target', () => {
    const b = nitrogenBudget({ cropType: 'almond', plantingDate: '2023-11-10', areaHa: 5, now }) // leaf year 3: 80 of 250 lb
    expect(b.nKgHa).toBeCloseTo(280.2 * 0.32, 0)
    expect(b.yieldTargetKgHa).toBeNull()
    expect(b.cautions.join(' ')).toMatch(/UC schedule's figure for its age/)
  })

  it('splits the total across the season and the shares add up', () => {
    const b = nitrogenBudget(mature)
    expect(b.split).toHaveLength(3)
    expect(b.split.reduce((s, p) => s + p.share, 0)).toBeCloseTo(1, 5)
    expect(b.split.reduce((s, p) => s + p.nKgBlock!, 0)).toBeCloseTo(b.nKgBlock!, 0)
    expect(b.cautions.join(' ')).toMatch(/split is a starting shape/)
  })

  it('shows per-hectare figures only when the area is unknown', () => {
    const b = nitrogenBudget({ ...mature, areaHa: null })
    expect(b.nKgHa).not.toBeNull()
    expect(b.nKgBlock).toBeNull()
    expect(b.split[0].nKgBlock).toBeNull()
  })

  it('refuses a crop with no schedule instead of applying almond figures', () => {
    const b = nitrogenBudget({ ...mature, cropType: 'Pistachio' })
    expect(b.supported).toBe(false)
    expect(b.nKgHa).toBeNull()
    expect(b.cautions[0]).toMatch(/No nitrogen schedule/)
  })

  it('takes a per-farm yield target', () => {
    expect(nitrogenBudget({ ...mature, yieldTargetKgHa: 3138.4 }).nKgHa).toBeCloseTo(280.2, 0)
  })
})

describe('nitrogenApplied', () => {
  const log = (over: object = {}) => ({ performedAt: '2026-05-10T08:00:00Z', product: 'Urea 46', amountPerTree: 0.5, unit: 'kg', ...over })

  it('counts urea in kg per tree at 46% N for this year only', () => {
    const a = nitrogenApplied([log(), log({ performedAt: '2025-05-10T08:00:00Z' })], 1000, 2026)
    expect(a.nKg).toBe(230) // 0.5 x 1000 x 0.46
    expect(a.countedLogs).toBe(1)
  })

  it('lists, rather than guesses, entries it cannot count', () => {
    const a = nitrogenApplied([log({ product: 'NPK 20-20-20' }), log({ unit: 'L' }), log({ product: null })], 1000, 2026)
    expect(a.nKg).toBe(0)
    expect(a.skipped).toHaveLength(3)
    expect(nitrogenApplied([log()], 0, 2026).skipped[0].reason).toMatch(/tree count/)
  })
})

describe('describeNitrogenBudget', () => {
  it('gives the AI the budget, the split, what is applied and the cautions', () => {
    const b = nitrogenBudget(mature)
    const text = describeNitrogenBudget(b, { nKg: 100, countedLogs: 2, skipped: [] }).join('\n')
    expect(text).toMatch(/Nitrogen budget \(guide\)/)
    expect(text).toMatch(/Urea fertigation logged this year: 100 kg N/)
    expect(text).toMatch(/\[!\] Guide only/)
  })
})

describe('parseNSplit and a custom split', () => {
  it('reads a stored split and treats anything malformed as not set', () => {
    expect(parseNSplit([{ label: 'March', share: 0.5 }, { label: 'June', share: 0.5 }])).toHaveLength(2)
    expect(parseNSplit(null)).toBeUndefined()
    expect(parseNSplit([{ label: '', share: 1 }, { share: 0.3 }])).toBeUndefined()
  })

  it('uses the farm split instead of the default and drops the starting-shape caution', () => {
    const b = nitrogenBudget({ ...mature, split: [{ label: 'March', share: 0.6 }, { label: 'June', share: 0.4 }] })
    expect(b.split.map(p => p.label)).toEqual(['March', 'June'])
    expect(b.split[0].nKgBlock).toBeCloseTo(b.nKgBlock! * 0.6, 0)
    expect(b.cautions.join(' ')).not.toMatch(/starting shape/)
  })
})
