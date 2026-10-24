import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadPackSource } from '@/engines/pack/load'
import { packSchema } from '@/engines/pack/schema'
import { buildThresholdView, depletionBoundsViolation, packKey, type ThresholdBlockRow } from './alert-thresholds'

const almond = packSchema.parse(loadPackSource(join(__dirname, '../packs/almond/0.1.1')).raw)
const packs = new Map([[packKey('almond', '0.1.1'), almond]])

const block = (over: Partial<ThresholdBlockRow> = {}): ThresholdBlockRow => ({
  id: 'b1', name: 'Block 1', crop_type: 'Almond', variety: 'Vairo',
  field_capacity: 28, wilting_point: 14, root_depth_m: null,
  pack_id: 'almond', pack_version: '0.1.1', pack_variety_id: 'vairo',
  ...over,
})

describe('buildThresholdView', () => {
  it('uses the starting values when the farm has saved no policy, and says so', () => {
    const v = buildThresholdView({ policy: null, blocks: [], packs, soilTests: [] })
    expect(v.farm.allowableDepletion).toEqual({ value: 0.4, isDefault: true })
    expect(v.farm.frostMarginC).toEqual({ value: 2, isDefault: true })
    expect(v.farm.sensorFailedAfterHours).toEqual({ value: 24, isDefault: true })
  })

  it('sizes the irrigate-now point from the block reserve and the farm depletion', () => {
    const v = buildThresholdView({
      policy: { allowable_depletion: '0.5', frost_margin_c: 1, sensor_failed_after_hours: 12, default_root_depth_m: '1.5' },
      blocks: [block()], packs, soilTests: [],
    })
    const b = v.blocks[0]
    expect(b.rootDepth).toEqual({ value: 1.5, from: 'farm' })
    expect(b.reserveMm).toBe(210) // 10 × (28 − 14) × 1.5
    expect(b.irrigateAtDepletionMm).toBe(105)
    expect(v.farm.allowableDepletion).toEqual({ value: 0.5, isDefault: false })
  })

  it('has no reserve and no root depth when neither the block nor the farm sets one', () => {
    const b = buildThresholdView({ policy: null, blocks: [block()], packs, soilTests: [] }).blocks[0]
    expect(b.rootDepth).toEqual({ value: null, from: 'none' })
    expect(b.reserveMm).toBeNull()
    expect(b.irrigateAtDepletionMm).toBeNull()
  })

  it('shows the live frost temperatures with the warning point the margin gives', () => {
    const b = buildThresholdView({ policy: null, blocks: [block()], packs, soilTests: [] }).blocks[0]
    const bloom = b.frost!.find(f => f.stage === 'bloom')!
    expect(bloom.basis).toBe('variety_tested')
    expect(bloom.warningAtC).toBeCloseTo(bloom.lt10 + 2, 5)
  })

  it('runs no frost check for a crop without frost data', () => {
    const b = buildThresholdView({ policy: null, blocks: [block({ crop_type: 'Quinoa', pack_id: null, pack_version: null })], packs, soilTests: [] }).blocks[0]
    expect(b.frost).toBeNull()
    expect(b.packKey).toBeNull()
  })

  it('suggests water limits from the newest soil test of the block, before a whole-farm test', () => {
    const soilTests = [
      { id: 'farm-new', block_id: null, recorded_at: '2026-06-01', parameters: { sand: 65, clay: 10, organic_matter: 2.5 } },
      { id: 'own-old', block_id: 'b1', recorded_at: '2025-03-01', parameters: { sand: 40, clay: 20, organic_matter: 2.5, texture_class: 'Loam' } },
      { id: 'own-new-no-texture', block_id: 'b1', recorded_at: '2026-09-01', parameters: { ph: 8.1 } },
    ]
    const b = buildThresholdView({ policy: null, blocks: [block()], packs, soilTests }).blocks[0]
    expect(b.soil).toMatchObject({ testId: 'own-old', scope: 'block', textureClass: 'Loam' })
    expect(b.soil!.estimate).toMatchObject({ ok: true, fieldCapacityPct: 28, wiltingPointPct: 13.7 })
  })

  it('falls back to a whole-farm soil test and reports a missing organic matter value', () => {
    const soilTests = [{ id: 'farm', block_id: null, recorded_at: '2026-06-01', parameters: { sand: '65', clay: '10' } }]
    const b = buildThresholdView({ policy: null, blocks: [block()], packs, soilTests }).blocks[0]
    expect(b.soil).toMatchObject({ testId: 'farm', scope: 'farm', sandPct: 65 })
    expect(b.soil!.estimate).toEqual({ ok: false, reason: 'missing_organic_matter' })
  })

  it('lists the bound pack once with its values and their status', () => {
    const v = buildThresholdView({ policy: null, blocks: [block(), block({ id: 'b2' })], packs, soilTests: [] })
    expect(v.packs).toHaveLength(1)
    const p = v.packs[0]
    expect(p.depletion).toMatchObject({ value: 0.4, bounds: [0.3, 0.6], status: 'sourced' })
    expect(p.rootDepth).toMatchObject({ value: null, status: 'to be sourced' })
    expect(p.depletionOutsideBounds).toBe(false)
    expect(p.frostStages.length).toBeGreaterThan(0)
    expect(p.pests.every(x => x.events.every(e => e.degreeDays !== null))).toBe(true)
  })

  it('flags a farm depletion outside the pack bounds', () => {
    const v = buildThresholdView({
      policy: { allowable_depletion: 0.7, frost_margin_c: 2, sensor_failed_after_hours: 24, default_root_depth_m: null },
      blocks: [block()], packs, soilTests: [],
    })
    expect(v.packs[0].depletionOutsideBounds).toBe(true)
  })
})

describe('depletionBoundsViolation', () => {
  it('accepts a value inside every bound pack and names the pack that refuses one', () => {
    expect(depletionBoundsViolation(0.45, [almond])).toBeNull()
    expect(depletionBoundsViolation(0.7, [almond])).toEqual({ cropName: almond.manifest.crop.common_name, version: '0.1.1', bounds: [0.3, 0.6] })
    expect(depletionBoundsViolation(0.7, [])).toBeNull()
  })
})
