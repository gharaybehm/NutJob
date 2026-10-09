import { describe, expect, it } from 'vitest'
import { createPackContext } from './context'
import { packDigest } from './load'
import { formatValidationReport, validatePack } from './validate'

interface DemoRow {
  id: string
  when: Record<string, unknown>
  then: Record<string, unknown>
  evidence?: string
}

/** A small, complete pack for a made-up crop. */
function demoPack() {
  const rows: DemoRow[] = [
    { id: 'D-0', when: { phase: 'resting' }, then: { action: 'none' } },
    { id: 'D-1', when: { phase_in: ['growing'], Dr_ge: 'RAW' }, then: { action: 'irrigate', amount: 'Dr * $refill' }, evidence: 'SRC' },
    { id: 'D-2', when: {}, then: { action: 'hold' } },
  ]
  return {
    manifest: {
      id: 'demo',
      crop: { common_name: 'Demo crop', scientific_name: 'Exemplum exempli' },
      version: '1.0.0',
      min_platform_version: '0.1.0',
      authors: ['Test'],
      review_date: '2026-01-01',
      regions: ['Anywhere'],
      licence: 'Test',
      signature: 'sha256:abc',
    },
    crop: { type: 'annual', harvested_product: 'grain', yield_unit: 'kg/ha', price_unit: 'per kg' },
    phenology: {
      scale: { id: 'simple', name: 'Simple scale', evidence: 'SRC', stages: [{ code: '1', name: 'Growing' }] },
      phases: [
        { id: 'resting', name: 'Resting', starts_at_stage: '0' },
        { id: 'growing', name: 'Growing', starts_at_stage: '1' },
      ],
    },
    water: {
      kcb: { method: 'curve', curve: [{ phase: 'growing', kcb: '$kcb_growing' }], evidence: 'SRC' },
      depletion_fraction: '$p',
      root_depth_m: '$root_depth_m',
      decision_table: {
        table: 'irrigation',
        hit_policy: 'first',
        rows,
      },
    },
    pests: {
      pests: [
        {
          id: 'grub',
          name: 'Demo grub',
          monitoring: { method: 'Traps' },
          biofix: { rule: 'First catch' },
          degree_days: { method: 'single_sine', cutoff: 'horizontal', lower: 10, upper: 30, units: 'C', evidence: 'SRC' },
          evidence: 'SRC',
        },
      ],
    },
    parameters: {
      parameters: [
        { id: 'p', start: 0.5, unit: 'fraction', bounds: [0.3, 0.7], status: 'sourced', evidence: 'SRC' },
        { id: 'refill', start: 1.1, unit: 'ratio', bounds: [1, 1.3], status: 'expert estimate', evidence: 'SRC' },
        { id: 'kcb_growing', start: 0.9, unit: 'dimensionless', bounds: [0.7, 1.1], status: 'sourced', evidence: 'SRC' },
        { id: 'root_depth_m', start: null, unit: 'm', bounds: null, status: 'to be sourced', evidence: null },
      ],
    },
    evidence: { evidence: { SRC: 'A source.' } },
    tests: [
      { id: 't0', kind: 'table', table: 'irrigation', state: { phase: 'resting' }, expect: { row: 'D-0' } },
      { id: 't1', kind: 'table', table: 'irrigation', state: { phase: 'growing', Dr: 50, RAW: 40 }, expect: { row: 'D-1', amount: 55 } },
      { id: 't2', kind: 'table', table: 'irrigation', state: { phase: 'growing', Dr: 10, RAW: 40 }, expect: { row: 'D-2' } },
      { id: 't3', kind: 'degree_days', pest: 'grub', tmin: 12, tmax: 20, expect: 6 },
    ],
  }
}

type Demo = ReturnType<typeof demoPack>
const broken = (change: (pack: Demo) => void) => {
  const pack = demoPack()
  change(pack)
  return validatePack(pack)
}
const codes = (r: ReturnType<typeof validatePack>) => r.errors.map(e => e.code)

describe('validatePack', () => {
  it('accepts a complete pack', () => {
    const r = validatePack(demoPack())
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.tests.every(t => t.passed)).toBe(true)
  })

  it('V1: rejects a pack that needs a newer platform', () => {
    const r = broken(p => (p.manifest.min_platform_version = '9.0.0'))
    expect(codes(r)).toEqual(['V1'])
    expect(r.errors[0].message).toMatch(/needs platform 9\.0\.0/)
  })

  it('V1: rejects a signature that does not match the files', () => {
    expect(codes(validatePack(demoPack(), { digest: 'sha256:other' }))).toEqual(['V1'])
    expect(validatePack(demoPack(), { digest: 'sha256:abc' }).ok).toBe(true)
  })

  it('V1: rejects a manifest with a missing field', () => {
    const r = broken(p => delete (p.manifest as Partial<Demo['manifest']>).licence)
    expect(codes(r)).toContain('V1')
  })

  it('V2: rejects a table that refers to an unknown $parameter', () => {
    const r = broken(p => (p.water.decision_table.rows[1].then.amount = 'Dr * $missing'))
    expect(codes(r)).toContain('V2')
    expect(r.errors.find(e => e.code === 'V2')?.message).toMatch(/\$missing/)
  })

  it('V2: rejects a sourced parameter without bounds or evidence, or outside its bounds', () => {
    expect(broken(p => (p.parameters.parameters[0].bounds = null)).errors[0]).toMatchObject({ code: 'V2' })
    expect(broken(p => (p.parameters.parameters[0].evidence = null)).errors[0]).toMatchObject({ code: 'V2' })
    expect(broken(p => (p.parameters.parameters[0].start = 0.9)).errors[0].message).toMatch(/outside its bounds/)
  })

  it('V3: rejects a citation that is not in the evidence register', () => {
    const r = broken(p => (p.water.decision_table.rows[1].evidence = 'NOWHERE'))
    expect(codes(r)).toEqual(['V3'])
    expect(broken(p => (p.parameters.parameters[0].evidence = 'NOWHERE')).errors[0]).toMatchObject({ code: 'V3' })
  })

  it('V4: rejects a parameter or a model with no unit', () => {
    const noUnit = broken(p => delete (p.parameters.parameters[0] as Partial<Demo['parameters']['parameters'][number]>).unit)
    expect(codes(noUnit)).toContain('V4')
    const noModelUnits = broken(p => delete (p.pests.pests[0].degree_days as Partial<Demo['pests']['pests'][number]['degree_days']>).units)
    expect(codes(noModelUnits)).toContain('V4')
  })

  it('V5: rejects a phase that is not in the phenology mapping', () => {
    const inTable = broken(p => (p.water.decision_table.rows[0].when = { phase: 'sleeping' }))
    expect(codes(inTable)).toContain('V5')
    const inList = broken(p => (p.water.decision_table.rows[1].when = { phase_in: ['growing', 'ripening'], Dr_ge: 'RAW' }))
    expect(inList.errors.find(e => e.code === 'V5')?.message).toMatch(/ripening/)
    const inSection = broken(p => (p.water.kcb.curve[0].phase = 'ripening'))
    expect(codes(inSection)).toContain('V5')
  })

  it('V6: rejects a pack whose own test fails', () => {
    const r = broken(p => (p.tests[1].expect = { row: 'D-1', amount: 99 }))
    expect(codes(r)).toEqual(['V6'])
    expect(r.errors[0].message).toMatch(/t1.*amount/)
  })

  it('V6: rejects a table or a model with no test case', () => {
    expect(broken(p => p.tests.pop()).errors[0].message).toMatch(/degree_days "grub"/)
    const noTableTests = broken(p => (p.tests = p.tests.filter(t => t.kind !== 'table')))
    expect(noTableTests.errors[0].message).toMatch(/table "irrigation"/)
  })

  it('V6: warns about a table row with no test case', () => {
    const r = broken(p => p.tests.splice(2, 1))
    expect(r.ok).toBe(true)
    expect(r.warnings.find(w => w.code === 'V6')?.message).toMatch(/D-2/)
  })

  it('V7: lists what is still to be sourced and keeps the engine out of Live', () => {
    const r = validatePack(demoPack())
    expect(r.toBeSourced.map(p => p.id)).toEqual(['root_depth_m'])
    expect(r.expertEstimates.map(p => p.id)).toEqual(['refill'])
    expect(r.engines.irrigation).toMatchObject({ hasContent: true, liveBlockedBy: ['root_depth_m'] })
    expect(r.engines.insect_pest).toMatchObject({ hasContent: true, liveBlockedBy: [] })
  })

  it('marks an engine the pack has no content for as inactive (R1.3)', () => {
    const r = validatePack(demoPack())
    expect(r.engines.frost.hasContent).toBe(false)
    expect(formatValidationReport(r)).toMatch(/frost: inactive, the pack has no content for it/)
  })

  it('rejects an expression that does not parse', () => {
    expect(broken(p => (p.water.decision_table.rows[1].when = { Dr_ge: 'RAW +' })).ok).toBe(false)
  })

  it('rejects a mistyped field on a parameter instead of dropping it', () => {
    const r = broken(p => ((p.parameters.parameters[0] as Record<string, unknown>).boundz = [0, 1]))
    expect(r.ok).toBe(false)
  })

  it('does not treat a $name inside a note as a reference', () => {
    const r = broken(p => ((p.parameters.parameters[0] as Record<string, unknown>).note = 'See $elsewhere'))
    expect(r.ok).toBe(true)
  })
})

describe('packDigest', () => {
  const files = [
    { path: 'manifest.yaml', content: 'id: demo\nsignature: unsigned\n' },
    { path: 'water.yaml', content: 'a: 1\n' },
  ]

  it('ignores the signature line, file order and line endings', () => {
    const signed = [{ path: 'water.yaml', content: 'a: 1\r\n' }, { path: 'manifest.yaml', content: 'id: demo\r\nsignature: sha256:xyz\r\n' }]
    expect(packDigest(signed)).toBe(packDigest(files))
  })

  it('changes when any content changes', () => {
    expect(packDigest([files[0], { path: 'water.yaml', content: 'a: 2\n' }])).not.toBe(packDigest(files))
  })
})

describe('createPackContext', () => {
  const pack = validatePack(demoPack()).pack!

  it('gives the pack start values', () => {
    const ctx = createPackContext(pack)
    expect(ctx.param('p')).toBe(0.5)
    expect(ctx.resolve('$refill')).toBe(1.1)
    expect(ctx.calibrated).toEqual([])
  })

  it('applies a farm calibration inside the pack bounds', () => {
    const ctx = createPackContext(pack, { p: 0.6 })
    expect(ctx.param('p')).toBe(0.6)
    expect(ctx.calibrated).toEqual(['p'])
    expect(pack.parameters.parameters[0].start).toBe(0.5)
  })

  it('holds a calibration outside the bounds for review (R11.1)', () => {
    const ctx = createPackContext(pack, { p: 0.9, unknown: 1, root_depth_m: 1.2 })
    expect(ctx.param('p')).toBe(0.5)
    expect(ctx.held.map(h => h.id)).toEqual(['p', 'unknown', 'root_depth_m'])
    expect(ctx.held[0].reason).toMatch(/Outside the pack bounds 0\.3 to 0\.7/)
  })

  it('refuses a value that is still to be sourced', () => {
    expect(() => createPackContext(pack).param('root_depth_m')).toThrow(/still to be sourced/)
    expect(() => createPackContext(pack).param('nope')).toThrow(/no parameter/)
  })

  it('evaluates a table with the values in force and records the pack version', () => {
    const trace = createPackContext(pack, { refill: 1.2 }).evaluate('irrigation', { phase: 'growing', Dr: 50, RAW: 40 })
    expect(trace).toMatchObject({ rowId: 'D-1', packId: 'demo', packVersion: '1.0.0', params: { refill: 1.2 } })
    expect(trace.amount).toBeCloseTo(60, 10)
  })
})
