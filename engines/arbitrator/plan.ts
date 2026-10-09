/**
 * The arbitrator (CDSS spec §A8, layer 3): collects the proposed actions of
 * every block and crop on a farm and decides which run, and on which day,
 * over a rolling seven-day horizon, since the blocks share labour, water and
 * equipment.
 *
 * It never invents an action or changes an engine's numbers. A mandatory
 * action that cannot fit is reported with what stops it, never dropped
 * silently (R8.1), and every deferred action carries its reason (R8.2).
 * Safeguard vetoes close days before the solver sees them.
 */

import type { ProposedAction } from '../framework/types'
import { frostWaterPriorityDays, type FrostProtectionMethod } from '../safeguards/frost'
import { addDays } from '../decision/weather'
import { solve, Usage, type ArbAction, type ArbLimits } from './solve'

export const HORIZON_DAYS = 7

export interface FarmLimits {
  labourHrsPerDay: number | null
  waterM3PerDay: number | null
  /** Sprayers on the farm; null when not set. One sprayer covers one block a day (R8.3). */
  sprayers: number | null
  waterQuotaM3: number | null
  frostProtectionMethod: FrostProtectionMethod | null
}

export interface PlanInput {
  /** Farm-local date of the plan. */
  today: string
  actions: ProposedAction[]
  /** Engines that evaluate daily; their actions take priority over seasonal tasks (R8.4). */
  continuousEngines: string[]
  /** Per block: the re-entry interval in force (SG-SPR-5). */
  reentryBlockedUntil: Record<string, string | null>
  limits: FarmLimits
}

export interface Veto {
  actionId: string
  day: number
  safeguardId: string
  reason: string
}

export type DeferralReason = 'safeguard' | 'outside_horizon' | 'resource_limit' | 'not_worth_the_delay' | 'search_limit'

export interface FarmPlan {
  today: string
  horizonDays: number
  status: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE'
  plan: { actionId: string; blockId: string; day: number; date: string }[]
  deferred: { actionId: string; blockId: string; reason: DeferralReason; detail: string }[]
  /** Mandatory actions that could not be scheduled, with what stops each (R8.1). */
  unscheduledMandatory: { actionId: string; blockId: string; conflicts: string[] }[]
  /** Every veto applied, to be shown verbatim (R9.3). */
  safeguardEvents: Veto[]
  /** Limits that are not set, and safeguards that could not be applied. */
  notes: string[]
}

interface SpraySafeguards {
  openDays: number[]
  note: string | null
  products: { name: string; blocked: { safeguardId: string; reason: string }[]; days: { dayIndex: number; vetoes: { safeguardId: string; reason: string }[] }[] }[]
}

/** Safeguard vetoes for each action and day of the horizon. */
export function vetoes(input: PlanInput): { vetoes: Veto[]; notes: string[] } {
  const out: Veto[] = []
  const notes: string[] = []
  const days = Array.from({ length: HORIZON_DAYS }, (_, d) => d)

  // SG-FRO-1: on a night the farm protects with water, that water comes first.
  const frostDays = input.actions.filter(a => a.engineId === 'frost' && a.actionType === 'frost_protect').map(a => a.earliestDay)
  const priority = frostWaterPriorityDays(frostDays, input.limits.frostProtectionMethod)
  if (priority.note) notes.push(priority.note)

  for (const a of input.actions) {
    // SG-SPR-1 to 8: a spray may run only on a day some listed product passes every spray safeguard.
    const spray = a.inputsSnapshot.spray_safeguards as SpraySafeguards | undefined
    if (spray) {
      for (const day of days) {
        if (spray.openDays.includes(day)) continue
        const found = new Map<string, string>()
        for (const p of spray.products) {
          for (const b of p.blocked) found.set(b.safeguardId, `${p.name}: ${b.reason}`)
          for (const v of p.days.find(d => d.dayIndex === day)?.vetoes ?? []) found.set(v.safeguardId, `${p.name}: ${v.reason}`)
        }
        if (found.size === 0) found.set('SG-SPR', spray.note ?? 'No product in the library passes the spray safeguards on this day')
        for (const [safeguardId, reason] of found) out.push({ actionId: a.actionId, day, safeguardId, reason })
      }
    }

    // SG-SPR-5: nobody enters a block during its re-entry interval.
    const blockedUntil = input.reentryBlockedUntil[a.blockId]
    if (a.requiresEntry && blockedUntil) {
      for (const day of days) {
        if (addDays(input.today, day) <= blockedUntil.slice(0, 10)) {
          out.push({ actionId: a.actionId, day, safeguardId: 'SG-SPR-5', reason: `Re-entry interval in the block runs until ${blockedUntil}` })
        }
      }
    }

    if (a.engineId !== 'frost' && a.waterM3 > 0) {
      for (const day of priority.days) {
        out.push({ actionId: a.actionId, day, safeguardId: 'SG-FRO-1', reason: 'Frost-protection water has priority on this night' })
      }
    }
  }
  return { vetoes: out, notes }
}

export function buildPlan(input: PlanInput): FarmPlan {
  const { vetoes: allVetoes, notes } = vetoes(input)
  const vetoed = new Set(allVetoes.map(v => `${v.actionId}|${v.day}`))
  const limits: ArbLimits = {
    horizonDays: HORIZON_DAYS,
    labourHrsPerDay: input.limits.labourHrsPerDay,
    waterM3PerDay: input.limits.waterM3PerDay,
    equipmentPerDay: input.limits.sprayers === null ? {} : { sprayer: input.limits.sprayers },
    waterQuotaM3: input.limits.waterQuotaM3,
  }
  if (limits.labourHrsPerDay === null) notes.push('No daily labour limit is set for the farm, so labour does not limit the plan')
  if (limits.waterM3PerDay === null) notes.push('No daily water limit is set for the farm, so water does not limit the plan')
  if (input.limits.sprayers === null) notes.push('The number of sprayers is not set, so sprayers do not limit the plan')

  const byId = new Map(input.actions.map(a => [a.actionId, a]))
  const window = (a: ProposedAction) => {
    const days: number[] = []
    for (let d = Math.max(0, a.earliestDay); d <= Math.min(HORIZON_DAYS - 1, a.latestDay); d++) days.push(d)
    return days
  }
  const arb: ArbAction[] = input.actions.map(a => ({
    id: a.actionId,
    days: window(a).filter(d => !vetoed.has(`${a.actionId}|${d}`)),
    value: a.expectedLossAvoided * a.confidence,
    delayCostPerDay: a.delayCostPerDay,
    labourHrs: a.labourHrs,
    waterM3: a.waterM3,
    equipment: a.equipment,
    mandatory: a.mandatory,
    priority: input.continuousEngines.includes(a.engineId) ? 2 : 1,
  }))

  const result = solve(arb, limits)

  // What is left of each day once the plan is placed, to explain what did not fit.
  const usage = new Usage(limits)
  const arbById = new Map(arb.map(a => [a.id, a]))
  for (const p of result.plan) usage.add(arbById.get(p.actionId) as ArbAction, p.day)

  const why = (a: ArbAction): { reason: DeferralReason; detail: string } => {
    const action = byId.get(a.id) as ProposedAction
    if (window(action).length === 0) {
      return { reason: 'outside_horizon', detail: `Its window (day ${action.earliestDay} to ${action.latestDay}) is outside the ${HORIZON_DAYS}-day plan` }
    }
    if (a.days.length === 0) {
      const reasons = [...new Set(allVetoes.filter(v => v.actionId === a.id).map(v => `${v.safeguardId}: ${v.reason}`))]
      return { reason: 'safeguard', detail: `No permitted day. ${reasons.join('; ')}` }
    }
    const short = new Set<string>()
    let fits = false
    for (const d of a.days) {
      const s = usage.shortfalls(a, d)
      if (s.length === 0) fits = true
      for (const r of s) short.add(r)
    }
    if (!fits) return { reason: 'resource_limit', detail: `Not enough ${[...short].join(', ')} on any permitted day once the higher-value actions are placed` }
    if (a.days.every(d => a.value - a.delayCostPerDay * d < 0)) {
      return { reason: 'not_worth_the_delay', detail: 'On every permitted day its delay cost is higher than the loss it avoids' }
    }
    return { reason: 'search_limit', detail: 'The search stopped before placing it; the plan is good but not proven best' }
  }

  const plan = result.plan.map(p => ({ actionId: p.actionId, blockId: (byId.get(p.actionId) as ProposedAction).blockId, day: p.day, date: addDays(input.today, p.day) }))
  const deferred: FarmPlan['deferred'] = []
  const unscheduledMandatory: FarmPlan['unscheduledMandatory'] = []
  for (const id of result.unscheduled) {
    const a = arbById.get(id) as ArbAction
    const blockId = (byId.get(id) as ProposedAction).blockId
    const w = why(a)
    if (a.mandatory) unscheduledMandatory.push({ actionId: id, blockId, conflicts: [w.detail] })
    else deferred.push({ actionId: id, blockId, ...w })
  }

  return { today: input.today, horizonDays: HORIZON_DAYS, status: result.status, plan, deferred, unscheduledMandatory, safeguardEvents: allVetoes, notes }
}
