/**
 * Irrigation engine (CDSS spec §A6.2): decides when and how much to irrigate
 * a block by applying the pack's irrigation table to the block's state. The
 * thresholds, phases and amounts all come from the pack.
 */

import type { PackContext } from '../pack/context'
import type { BlockState, DecisionEngine, EngineDiagnosis, ProposedAction } from '../framework/types'
import { proposeAction, stateFlags, tableOutcome } from './action'

const TABLE = 'irrigation'

function decide(state: BlockState, pack: PackContext) {
  const trace = pack.evaluate(TABLE, state)
  const table = pack.table(TABLE)
  const fired = table?.rows.find(r => r.id === trace.rowId)
  const catchAll = fired !== undefined && Object.keys(fired.when).length === 0
  return { trace, outcome: tableOutcome(trace, catchAll) }
}

export const irrigationEngine: DecisionEngine = {
  engineId: 'irrigation',
  engineClass: 'continuous',
  packRequirements: () => ['water.decision_table', 'water.kcb', 'water.depletion_fraction'],
  requiredState: () => ['phase', 'Dr', 'RAW', 'rain_48h_mm', 'rain_prob', 'efficiency', 'leaching_fraction'],
  safeguards: () => ['SG-IRR-1', 'SG-IRR-2', 'SG-IRR-3'],

  diagnose(state, pack): EngineDiagnosis {
    const { outcome } = decide(state, pack)
    const missing = Array.isArray(state.water_balance_missing) ? (state.water_balance_missing as string[]) : []
    const notes = missing.length > 0 ? [...outcome.notes, `The water balance was not computed: ${missing.join('; ')}`] : outcome.notes
    return { ruleId: outcome.ruleId, outcome: outcome.outcome, skipped: outcome.skipped, notes }
  },

  evaluate(blockId, state, pack): ProposedAction[] {
    const { trace, outcome } = decide(state, pack)
    // A row proposes an irrigation when it carries an amount; hold, defer and none do not.
    if (!outcome.determined || outcome.ruleId === null || trace.amount === null || trace.amount <= 0) return []

    const mm = Math.round(trace.amount * 10) / 10
    const areaHa = typeof state.area_ha === 'number' ? state.area_ha : null
    const flags = [...stateFlags(state)]
    if (outcome.skipped.length > 0) flags.push('RULES_SKIPPED')
    if (typeof trace.then?.flag === 'string') flags.push(trace.then.flag)

    return [
      proposeAction({
        engineId: 'irrigation',
        ruleId: outcome.ruleId,
        packId: trace.packId,
        packVersion: trace.packVersion,
        blockId,
        actionType: outcome.outcome ?? 'irrigate',
        description: [`Apply ${mm} mm`, ...outcome.notes].join('. '),
        quantity: mm,
        unit: 'mm',
        earliestDay: 0,
        latestDay: 1,
        waterM3: areaHa === null ? 0 : Math.round(mm * areaHa * 10),
        inputsSnapshot: { ...trace.inputs, params: trace.params },
        evidence: trace.evidence,
        expectedOutcome: 'Root-zone depletion back below the readily available water after the irrigation',
        flags,
      }),
    ]
  },
}
