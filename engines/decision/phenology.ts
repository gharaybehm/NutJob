/**
 * Phenology engine (CDSS spec §A6.1): the clock for every other engine. It
 * keeps each block's current phase and asks for an observation when the
 * phase cannot be known.
 *
 * An observed stage always overrides a predicted one. Prediction from chill
 * and heat is not active yet: it needs the variety requirements, which the
 * pack must supply first.
 */

import type { Pack } from '../pack/schema'
import type { BlockState, DecisionEngine, EngineDiagnosis, ProposedAction } from '../framework/types'
import { proposeAction, stateFlags } from './action'

export interface RecordedStage {
  /** The stage name as the application records it. */
  stage: string
  recordedAt: string | null
  source: string | null
}

export type PhaseResolution =
  | { phase: string; reason: null }
  | { phase: null; reason: 'no_stage' | 'stage_not_in_pack' }

/** The pack phase a recorded stage falls in. */
export function resolvePhase(pack: Pack, recorded: RecordedStage | null): PhaseResolution {
  if (!recorded) return { phase: null, reason: 'no_stage' }
  const phase = pack.phenology.phases.find(p => p.recorded_as.includes(recorded.stage))
  return phase ? { phase: phase.id, reason: null } : { phase: null, reason: 'stage_not_in_pack' }
}

const RULE_NO_STAGE = 'PHEN-STAGE-MISSING'
const RULE_UNMAPPED = 'PHEN-STAGE-NOT-IN-PACK'

export const phenologyEngine: DecisionEngine = {
  engineId: 'phenology',
  engineClass: 'continuous',
  packRequirements: () => ['phenology.phases'],
  requiredState: () => ['phase', 'recorded_stage'],
  safeguards: () => [],

  diagnose(state): EngineDiagnosis {
    if (typeof state.phase === 'string') {
      return { ruleId: null, outcome: state.phase, skipped: [], notes: [`From the recorded stage "${String(state.recorded_stage)}"`] }
    }
    if (state.recorded_stage === null || state.recorded_stage === undefined) {
      return { ruleId: RULE_NO_STAGE, outcome: null, skipped: [], notes: ['No growth stage is recorded for the block'] }
    }
    return {
      ruleId: RULE_UNMAPPED,
      outcome: null,
      skipped: [],
      notes: [`The pack has no phase for the recorded stage "${String(state.recorded_stage)}"`],
    }
  },

  evaluate(blockId: string, state: BlockState, pack): ProposedAction[] {
    // An unmapped stage is a gap in the pack, not something scouting can fix, so only a missing stage asks for one.
    if (typeof state.phase === 'string' || (state.recorded_stage !== null && state.recorded_stage !== undefined)) return []
    return [
      proposeAction({
        engineId: 'phenology',
        ruleId: RULE_NO_STAGE,
        packId: pack.packId,
        packVersion: pack.packVersion,
        blockId,
        actionType: 'observe',
        description: 'Record the current growth stage of the block',
        earliestDay: 0,
        latestDay: 3,
        inputsSnapshot: { recorded_stage: null },
        evidence: null,
        expectedOutcome: 'The block has a growth phase, so the other engines can assess it',
        flags: stateFlags(state),
      }),
    ]
  },
}
