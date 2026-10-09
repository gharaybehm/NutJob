import { readdirSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { createPackContext } from '../../engines/pack/context'
import { loadPackSource } from '../../engines/pack/load'
import { validatePack } from '../../engines/pack/validate'

const source = loadPackSource(join(__dirname, '0.1.1'))
const report = validatePack(source.raw, { digest: source.digest })

describe('almond pack 0.1.1 (latest)', () => {
  it('validates with no errors and a matching signature', () => {
    expect(report.errors).toEqual([])
    expect(report.ok).toBe(true)
    expect(report.packId).toBe('almond')
    expect(report.version).toBe('0.1.1')
  })

  it('passes its own test suite', () => {
    expect(report.tests.length).toBeGreaterThan(0)
    expect(report.tests.filter(t => !t.passed)).toEqual([])
  })

  it('has a test case for every row of its decision tables', () => {
    expect(report.warnings.filter(w => w.code === 'V6')).toEqual([])
  })

  it('reports the values still to be sourced (specification C9)', () => {
    const ids = report.toBeSourced.map(p => p.id)
    for (const id of [
      'makako_chill_cp',
      'vairo_chill_cp',
      'makako_heat_gdh',
      'vairo_heat_gdh',
      'bbch_bloom_start',
      'n_growth_young_kg_ha',
      'max_single_dose_kg_ha',
      'na_limit',
      'cl_limit',
      'b_limit',
      'rlb_makako_loss_modifier',
      'hive_density_per_ha',
      'pruning_dry_window_days',
      'harvest_moisture_target_pct',
    ]) {
      expect(ids).toContain(id)
    }
    const pending = report.pendingContent.map(p => p.item).join(' | ')
    expect(pending).toMatch(/Regional pest models/)
    expect(pending).toMatch(/shot hole, scab, rust, anthracnose, Fusicoccum and Monilinia/)
    expect(pending).toMatch(/10 % and 90 % damage temperatures/)
  })

  it('keeps every engine with a missing value out of Live', () => {
    expect(report.engines.phenology.liveBlockedBy).toContain('vairo_chill_cp')
    expect(report.engines.fertigation.liveBlockedBy).toContain('max_single_dose_kg_ha')
    expect(report.engines.irrigation.hasContent).toBe(true)
  })

  it('marks the values that disagree with the live app for agronomist review', () => {
    const notes = report.reviewNotes.map(n => `${n.where}: ${n.note}`).join(' | ')
    expect(notes).toMatch(/2\.6 % as the ceiling for leaf nitrogen/)
    expect(notes).toMatch(/potassium as adequate from 1\.0 %/)
    expect(notes).toMatch(/boron on leaves/)
    expect(notes).toMatch(/budgets nitrogen differently/)
    expect(notes).toMatch(/Calle et al\. 2025/)
  })

  it('carries the measured Vairo full-bloom frost levels', () => {
    const ctx = createPackContext(report.pack!)
    const vairo = report.pack!.frost!.stages.find(s => s.id === 'full_bloom')!.by_variety.vairo
    expect(vairo.map(l => [l.damage_fraction, ctx.resolve(l.temp_c)])).toEqual([
      [0.1, -3.46],
      [0.5, -4.85],
      [0.9, -6.25],
    ])
  })

  it('says where it is valid and that Central Anatolia is unconfirmed', () => {
    expect(report.pack!.manifest.regions).toEqual(['Mediterranean climates'])
    expect(report.pack!.manifest.region_notes).toMatch(/Not confirmed for Central Anatolia/)
  })
})

/**
 * An installed version is never changed: a change to the pack is a new
 * version. Every version kept here must still validate, signature included,
 * because blocks stay bound to an old version until their farm moves them.
 */
describe('every almond pack version', () => {
  const versions = readdirSync(__dirname).filter(name => /^\d+\.\d+\.\d+$/.test(name))

  it.each(versions)('%s validates with a matching signature', version => {
    const s = loadPackSource(join(__dirname, version))
    const r = validatePack(s.raw, { digest: s.digest })
    expect(r.errors).toEqual([])
    expect(r.version).toBe(version)
  })

  it('includes the version installed in production on 2026-10-09', () => {
    expect(versions).toContain('0.1.0')
    expect(loadPackSource(join(__dirname, '0.1.0')).digest).toBe('sha256:e7c71030e2f01e45de67561ab41714b540ad76b5b591a57c384c797900e6a1b7')
  })
})
