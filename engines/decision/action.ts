/**
 * Shared pieces for the decision engines: flags, confidence, and turning a
 * decision-table result into an outcome (CDSS spec §A5).
 */

import type { PackTableTrace } from '../pack/context'
import type { EngineId } from '../pack/schema'
import type { EngineDiagnosis, ProposedAction } from '../framework/types'

/** Flags that say an input was weaker than a measurement; each lowers confidence. */
export const QUALITY_FLAGS = [
  'WEATHER_MODELLED',
  'INITIAL_DEPLETION_ASSUMED',
  'SOIL_EVAPORATION_DEFAULTS',
  'WETTED_FRACTION_ASSUMED',
  'PHASE_FROM_RECORDED_STAGE',
  'RULES_SKIPPED',
  'MODEL_SENSOR_DIVERGENCE',
] as const

/** Flags that describe the result without questioning its inputs. */
export const INFORMATION_FLAGS = ['LEACHING_NOT_ASSESSED', 'VALUE_NOT_ESTIMATED', 'NUTRIENT_CREDITS_NOT_ASSESSED'] as const

const CONFIDENCE_STEP = 0.1
const CONFIDENCE_FLOOR = 0.2

/** 0-1: lowered once for each quality flag present (spec §A5.2, "confidence"). */
export function confidenceFromFlags(flags: string[]): number {
  const weak = flags.filter(f => (QUALITY_FLAGS as readonly string[]).includes(f)).length
  return Math.max(CONFIDENCE_FLOOR, Math.round((1 - CONFIDENCE_STEP * weak) * 100) / 100)
}

export interface TableOutcome extends EngineDiagnosis {
  /** False when the table could not decide: a catch-all fired only because earlier rows lacked inputs. */
  determined: boolean
}

/**
 * Reads a first-hit table result. When rows above the fired row could not be
 * evaluated and the fired row is the unconditional catch-all, the result says
 * nothing about the block, so it is reported as undetermined, not as the
 * catch-all's outcome.
 */
export function tableOutcome(trace: PackTableTrace, catchAllFired: boolean): TableOutcome {
  const skipped = trace.skipped.map(s => ({ ruleId: s.rowId, missing: s.missing }))
  if (trace.rowId === null || (catchAllFired && skipped.length > 0)) {
    const missing = [...new Set(skipped.flatMap(s => s.missing))]
    return {
      determined: false,
      ruleId: null,
      outcome: null,
      skipped,
      notes: missing.length > 0 ? [`Cannot decide without: ${missing.join(', ')}`] : ['No rule matched'],
    }
  }
  const then = trace.then ?? {}
  const notes = [then.note, then.reason].filter((n): n is string => typeof n === 'string')
  return { determined: true, ruleId: trace.rowId, outcome: typeof then.action === 'string' ? then.action : null, skipped, notes }
}

export interface ActionInput {
  engineId: EngineId
  ruleId: string
  packId: string
  packVersion: string
  blockId: string
  actionType: string
  description: string
  quantity?: number | null
  unit?: string | null
  earliestDay: number
  latestDay: number
  waterM3?: number
  mandatory?: boolean
  inputsSnapshot: Record<string, unknown>
  evidence: string | null
  expectedOutcome?: string | null
  flags: string[]
}

/**
 * Builds a proposed action. Money values are zero and flagged until the yield
 * forecast and a price per farm exist; such an action is logged, not judged
 * against its cost.
 */
export function proposeAction(input: ActionInput): ProposedAction {
  const flags = [...new Set([...input.flags, 'VALUE_NOT_ESTIMATED'])]
  return {
    actionId: [input.blockId, input.engineId, input.ruleId, input.actionType, input.earliestDay].join(':'),
    engineId: input.engineId,
    ruleId: input.ruleId,
    packId: input.packId,
    packVersion: input.packVersion,
    blockId: input.blockId,
    actionType: input.actionType,
    description: input.description,
    quantity: input.quantity ?? null,
    unit: input.unit ?? null,
    earliestDay: input.earliestDay,
    latestDay: input.latestDay,
    expectedLossAvoided: 0,
    delayCostPerDay: 0,
    cost: 0,
    labourHrs: 0,
    waterM3: input.waterM3 ?? 0,
    equipment: [],
    confidence: confidenceFromFlags(flags),
    mandatory: input.mandatory ?? false,
    inputsSnapshot: input.inputsSnapshot,
    evidence: input.evidence,
    expectedOutcome: input.expectedOutcome ?? null,
    flags,
  }
}

/** The flags published in a block's state. */
export function stateFlags(state: Record<string, unknown>): string[] {
  return Array.isArray(state.flags) ? state.flags.filter((f): f is string => typeof f === 'string') : []
}
