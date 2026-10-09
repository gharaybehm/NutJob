import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { loadPackSource } from '../pack/load'
import { ENGINE_IDS, packSchema, type Pack } from '../pack/schema'
import { engineAvailability, packSection } from './availability'
import { actionVerdict, expectedLossAvoided, projectedLoss } from './expected-loss'
import type { DecisionEngine, ProposedAction } from './types'

const almond = packSchema.parse(loadPackSource(join(__dirname, '../../packs/almond/0.1.1')).raw)

describe('engineAvailability', () => {
  const engine = (requirements: string[]): Pick<DecisionEngine, 'engineId' | 'packRequirements'> => ({
    engineId: 'frost',
    packRequirements: () => requirements,
  })

  it('is active when the pack has every section the engine needs', () => {
    expect(engineAvailability(engine(['frost.stages', 'phenology.phases']), almond)).toEqual({ active: true })
  })

  it('is inactive, with a visible reason, when a section is missing or empty', () => {
    const noFrost: Pack = { ...almond, frost: undefined }
    const r = engineAvailability(engine(['frost.stages']), noFrost)
    expect(r.active).toBe(false)
    if (!r.active) {
      expect(r.missing).toEqual(['frost.stages'])
      expect(r.reason).toMatch(/has no frost\.stages, so the frost engine is inactive/)
    }
    expect(engineAvailability(engine(['nutrition.decision_table']), almond).active).toBe(false)
  })

  it('reads dotted paths', () => {
    expect(packSection(almond, 'manifest.id')).toBe(almond.manifest.id)
    expect(packSection(almond, 'water.nothing.here')).toBeUndefined()
  })
})

describe('expected loss avoided', () => {
  const input = { expectedYieldPerHa: 2000, areaHa: 5, price: 6, damageFraction: 0.1, efficacy: 0.8 }

  it('is projected loss x efficacy', () => {
    expect(projectedLoss(input)).toBe(6000)
    expect(expectedLossAvoided(input)).toBe(4800)
  })

  it('rejects fractions outside 0-1', () => {
    expect(() => expectedLossAvoided({ ...input, efficacy: 1.2 })).toThrow()
    expect(() => projectedLoss({ ...input, damageFraction: -0.1 })).toThrow()
  })

  it('downgrades to monitor when the loss avoided does not exceed the cost', () => {
    expect(actionVerdict(4800, 1000)).toBe('act')
    expect(actionVerdict(1000, 1000)).toBe('monitor')
    expect(actionVerdict(200, 1000)).toBe('monitor')
  })

  it('never downgrades a mandatory action', () => {
    expect(actionVerdict(0, 1000, true)).toBe('act')
  })
})

describe('engine contract', () => {
  it('can be implemented from pack content alone', () => {
    const engine: DecisionEngine = {
      engineId: 'irrigation',
      engineClass: 'continuous',
      packRequirements: () => ['water.decision_table'],
      requiredState: () => ['Dr', 'RAW'],
      safeguards: () => ['SG-IRR-1', 'SG-IRR-2', 'SG-IRR-3'],
      evaluate(blockId, state, pack): ProposedAction[] {
        const trace = pack.evaluate('irrigation', state)
        if (trace.rowId === null || trace.amount === null) return []
        return [
          {
            actionId: `${blockId}-${trace.rowId}`,
            engineId: 'irrigation',
            ruleId: trace.rowId,
            packId: trace.packId,
            packVersion: trace.packVersion,
            blockId,
            actionType: String(trace.then?.action),
            description: '',
            quantity: trace.amount,
            unit: 'mm',
            earliestDay: 0,
            latestDay: 1,
            expectedLossAvoided: 0,
            delayCostPerDay: 0,
            cost: 0,
            labourHrs: 0,
            waterM3: 0,
            equipment: [],
            confidence: 1,
            mandatory: false,
            inputsSnapshot: trace.inputs,
            evidence: trace.evidence,
            expectedOutcome: null,
            flags: [],
            requiresEntry: false,
            standing: false,
          },
        ]
      },
    }
    expect(ENGINE_IDS).toContain(engine.engineId)
    expect(engineAvailability(engine, almond)).toEqual({ active: true })
  })
})

/**
 * The golden rule of the specification: a variety name, pest name, disease
 * name or phenology phase in platform code is a defect. It belongs in a pack.
 */
describe('golden rule: no crop content in platform code', () => {
  const platformDirs = ['core', 'rules', 'pack', 'framework', 'decision', 'safeguards', 'arbitrator', 'narrator'].map(d => join(__dirname, '..', d))

  const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

  const platformWords = new Set<string>(ENGINE_IDS)
  const forbidden = [
    almond.manifest.id,
    almond.manifest.crop.common_name,
    ...(almond.varieties?.varieties ?? []).flatMap(v => [v.id, v.name]),
    ...almond.phenology.phases.map(p => p.id),
    ...(almond.pests?.pests ?? []).map(p => p.name),
    ...(almond.diseases?.diseases ?? []).flatMap(d => [d.id, d.name]),
  ]
    .map(w => w.toLowerCase())
    .filter(w => !platformWords.has(w))

  const sources = platformDirs.flatMap(dir =>
    readdirSync(dir)
      .filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts'))
      .map(name => ({ file: join(dir, name), code: stripComments(readFileSync(join(dir, name), 'utf8')).toLowerCase() })),
  )

  it('scans the platform modules', () => {
    expect(sources.length).toBeGreaterThan(15)
    expect(forbidden).toContain('vairo')
    expect(forbidden).toContain('kernel_fill')
  })

  it.each([...new Set(forbidden)])('"%s" does not appear in platform code', word => {
    const pattern = new RegExp(`(^|[^a-z0-9_])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9_]|$)`)
    const hits = sources.filter(s => pattern.test(s.code)).map(s => s.file)
    expect(hits).toEqual([])
  })
})
