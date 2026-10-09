/**
 * The contract every decision engine implements, and the standard format of
 * the actions it proposes (CDSS spec §A5.1 and §A5.2).
 *
 * An engine applies the pack's decision tables to a block's state and
 * proposes actions. It never talks to the farmer directly and never
 * bypasses the arbitrator. Field names follow the specification, in the
 * camelCase this codebase uses for engine types.
 */

import type { PackContext } from '../pack/context'
import type { EngineId } from '../pack/schema'

/** Continuous engines evaluate daily; seasonal engines plan a calendar and react to weather. */
export type EngineClass = 'continuous' | 'seasonal'

/** The shared block state engines read and publish to (§A7). */
export type BlockState = Record<string, unknown>

export interface DecisionEngine {
  engineId: EngineId
  engineClass: EngineClass
  /**
   * Pack sections this engine needs, as dotted paths (for example
   * `water.decision_table`). A missing section makes the engine inactive
   * for that crop, with a visible reason; it does not fail.
   */
  packRequirements(): string[]
  /** State keys this engine reads. */
  requiredState(): string[]
  /**
   * Values this engine adds to the shared block state before any engine after
   * it runs (for example the growth phase, the expected yield or the leaching
   * fraction). Engines read each other's results only through that state.
   */
  publish?(state: BlockState, pack: PackContext): EnginePublication
  /** Returns zero or more proposed actions for one block. */
  evaluate(blockId: string, state: BlockState, pack: PackContext, today: Date): ProposedAction[]
  /** Ids of the hard safeguards (§A10) that apply to this engine's actions. */
  safeguards(): string[]
  /**
   * What the engine concluded and why, including when it proposes nothing
   * (hold, defer, inactive phase, a missing input). Kept with the block state
   * so a shadow record can be reviewed.
   */
  diagnose?(state: BlockState, pack: PackContext): EngineDiagnosis
}

export interface EnginePublication {
  values: Record<string, unknown>
  addFlags?: string[]
  removeFlags?: string[]
}

export interface EngineDiagnosis {
  /** The rule that decided the outcome; null when no rule could be evaluated. */
  ruleId: string | null
  /** The outcome in the rule's own word (for example hold, defer, irrigate). */
  outcome: string | null
  /** Rules that could not be evaluated, with the inputs they were missing. */
  skipped: { ruleId: string; missing: string[] }[]
  notes: string[]
}

export interface ProposedAction {
  actionId: string
  /** Which engine, which decision-table row, which pack version. */
  engineId: EngineId
  ruleId: string
  packId: string
  packVersion: string
  /** What to do, and where. */
  blockId: string
  actionType: string
  description: string
  /** For example 22 mm, 18 kg N/ha, 1 spray application. */
  quantity: number | null
  unit: string | null
  /** Window in days from today. */
  earliestDay: number
  latestDay: number
  /** Money value, in the farm's currency, if done inside the window. */
  expectedLossAvoided: number
  /** Value lost per day of delay within the window. */
  delayCostPerDay: number
  /** Direct cost: materials, energy, contractor. */
  cost: number
  /** Resources consumed. */
  labourHrs: number
  waterM3: number
  equipment: string[]
  /** 0-1. Lowered when inputs are stale, flagged or uncalibrated. */
  confidence: number
  /** True only when a safeguard or a legal requirement demands the action. */
  mandatory: boolean
  /** The exact state values the rule used. */
  inputsSnapshot: Record<string, unknown>
  /** Source citation from the pack row. */
  evidence: string | null
  /** What should be observed if the action is right, and when. */
  expectedOutcome: string | null
  /** Data-quality and model flags that lowered the confidence. */
  flags: string[]
  /** True when doing it means people entering the block (safeguard SG-SPR-5 keeps them out during a re-entry interval). */
  requiresEntry: boolean
  /** True for a task proposed once and left standing until its window closes; false for one proposed afresh every day. */
  standing: boolean
}
