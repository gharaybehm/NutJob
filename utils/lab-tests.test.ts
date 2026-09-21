import { describe, expect, it } from 'vitest'
import { checkLabConsistency, describeConflict, describeLabTest, pickLabTest, type LabTestRow } from './lab-tests'

// The real A Kalite Analiz report TT250093 (Sultanhani, June 2025).
const REPORT = {
  organic_matter: 2.07, phosphorus_p2o5: 11.1, potassium_k2o: 191.62, lime: 29.26, calcium: 4770.7,
  magnesium: 1943.7, sodium: 311.7, iron: 2.08, zinc: 0.72, copper: 1.72, manganese: 9.14, boron: 0.099,
  sand: 33.89, clay: 35.84, silt: 30.27, cec: 2.421,
}

const row = (over: Partial<LabTestRow> = {}): LabTestRow => ({
  id: 'r1', block_id: null, farm_id: 'F1', test_type: 'soil', recorded_at: '2025-06-04T00:00:00Z', created_at: '2026-06-16T10:00:00Z',
  lab_reference: 'TT250093', ph: 8.17, soil_ec: 0.836, parameters: { ...REPORT }, ...over,
})

describe('pickLabTest', () => {
  it('uses the farm-wide test for a block that has none of its own', () => {
    const r = pickLabTest([row()], { blockId: 'B1', farmId: 'F1', testType: 'soil' })
    expect(r.scope).toBe('farm')
    expect(r.row?.lab_reference).toBe('TT250093')
  })

  it('never uses another farm\'s whole-farm test', () => {
    const r = pickLabTest([row({ farm_id: 'OTHER' })], { blockId: 'B1', farmId: 'F1', testType: 'soil' })
    expect(r.row).toBeNull()
  })

  it('does not use a whole-farm test that has no farm at all', () => {
    expect(pickLabTest([row({ farm_id: null })], { blockId: 'B1', farmId: 'F1', testType: 'soil' }).row).toBeNull()
  })

  it('prefers the block\'s own test even when a farm-wide one is newer', () => {
    const own = row({ id: 'own', block_id: 'B1', recorded_at: '2025-01-01T00:00:00Z' })
    const wide = row({ id: 'wide', recorded_at: '2026-01-01T00:00:00Z' })
    const r = pickLabTest([wide, own], { blockId: 'B1', farmId: 'F1', testType: 'soil' })
    expect(r).toMatchObject({ scope: 'block' })
    expect(r.row?.id).toBe('own')
  })

  it('keeps soil and water tests apart', () => {
    const water = row({ id: 'w', test_type: 'water', recorded_at: '2026-05-01T00:00:00Z' })
    expect(pickLabTest([water, row()], { blockId: 'B1', farmId: 'F1', testType: 'soil' }).row?.id).toBe('r1')
    expect(pickLabTest([water, row()], { blockId: 'B1', farmId: 'F1', testType: 'water' }).row?.id).toBe('w')
  })

  it('breaks a same-date tie by the most recently saved record', () => {
    const a = row({ id: 'a', created_at: '2026-06-16T10:00:00Z' })
    const b = row({ id: 'b', created_at: '2026-06-16T10:05:00Z' })
    expect(pickLabTest([a, b], { blockId: 'B1', farmId: 'F1', testType: 'soil' }).row?.id).toBe('b')
  })

  it('reports a conflict when the same lab reference was saved with different values', () => {
    // The three copies of TT250093 found in the database
    const c1 = row({ id: '1', parameters: { ...REPORT, clay: 30.27, silt: 35.84, texture_class: 'Loam' } })
    const c2 = row({ id: '2', parameters: { ...REPORT, cec: 242.1, clay: 30.27, silt: 35.84, texture_class: 'Loam' }, created_at: '2026-06-16T10:01:00Z' })
    const c3 = row({ id: '3', parameters: { ...REPORT, cec: undefined, texture_class: 'Clay' }, created_at: '2026-06-16T10:02:00Z' })
    const r = pickLabTest([c1, c2, c3], { blockId: 'B1', farmId: 'F1', testType: 'soil' })
    expect(r.row?.id).toBe('3')
    expect(r.conflicts).toHaveLength(1)
    expect(r.conflicts[0]).toMatchObject({ reference: 'TT250093', count: 3 })
    expect(r.conflicts[0].fields).toEqual(expect.arrayContaining(['cec', 'clay', 'silt', 'texture_class']))
    expect(describeConflict(r.conflicts[0])).toMatch(/verify against the paper report/)
  })

  it('does not call a value present in only one record a conflict', () => {
    const a = row({ id: 'a', parameters: { ...REPORT } })
    const b = row({ id: 'b', parameters: { ...REPORT, cec: undefined }, created_at: '2026-06-16T10:05:00Z' })
    expect(pickLabTest([a, b], { blockId: 'B1', farmId: 'F1', testType: 'soil' }).conflicts).toEqual([])
  })

  it('reports no conflict for identical duplicates', () => {
    const a = row({ id: 'a' })
    const b = row({ id: 'b', created_at: '2026-06-16T10:05:00Z' })
    expect(pickLabTest([a, b], { blockId: 'B1', farmId: 'F1', testType: 'soil' }).conflicts).toEqual([])
  })
})

describe('checkLabConsistency', () => {
  it('flags the report\'s CEC as suspect against its own calcium and magnesium', () => {
    const flags = checkLabConsistency(row())
    expect(flags).toHaveLength(1)
    expect(flags[0]).toMatch(/more than the CEC of 2.421/)
    expect(flags[0]).toMatch(/about 39.8 meq/)
  })

  it('also flags the 24.21 reading, since Ca and Mg together still exceed it by more than half', () => {
    expect(checkLabConsistency(row({ parameters: { ...REPORT, cec: 24.21 } }))).toHaveLength(1)
  })

  it('passes a consistent CEC and does not flag an absent one', () => {
    expect(checkLabConsistency(row({ parameters: { ...REPORT, cec: 40 } }))).toEqual([])
    expect(checkLabConsistency(row({ parameters: { ...REPORT, cec: undefined } }))).toEqual([])
  })

  it('flags a texture that does not add up to 100%', () => {
    const flags = checkLabConsistency(row({ parameters: { sand: 33.89, clay: 35.84, silt: 20 } }))
    expect(flags[0]).toMatch(/add up to 89.7%/)
  })

  it('accepts the texture in the report', () => {
    expect(checkLabConsistency(row({ parameters: { sand: 33.89, clay: 35.84, silt: 30.27 } }))).toEqual([])
  })
})

describe('describeLabTest', () => {
  const text = describeLabTest(row()).join(' | ')

  it('gives phosphorus and potassium in kg/da, not ppm', () => {
    expect(text).toContain('P2O5 (Olsen) 11.1 kg/da (High)')
    expect(text).toContain('K2O 191.62 kg/da')
    expect(text).not.toMatch(/ppm.*P2O5|P: .* ppm/)
  })

  it('includes every parameter the lab reported, with reference bands', () => {
    expect(text).toContain('pH 8.17 (Slightly Alkaline)')
    expect(text).toContain('Lime (CaCO3) 29.26 % (Extremely Calcareous)')
    expect(text).toContain('Iron 2.08 ppm (Deficient)')
    expect(text).toContain('Zinc 0.72 ppm (Marginal)')
    expect(text).toContain('Boron 0.099 mg/kg (Deficient)')
    expect(text).toContain('Sodium 311.7 ppm')
    expect(text).toContain('Sand 33.89 %')
  })
})
