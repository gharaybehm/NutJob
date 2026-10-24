/**
 * The farm plan as the interface shows it, and the manager's decision on a
 * recommendation. Plain module (not a "use server" file).
 */

import type { ProposedAction } from '@/engines/framework/types'
import type { RecommendationCategory } from '@/utils/recommendation-effects'

export const DECISIONS = ['accepted', 'edited', 'skipped'] as const
export type Decision = (typeof DECISIONS)[number]

/** The specification's five reasons (A11.1), with "already done" kept from the existing skip reasons. */
export const DECISION_REASONS = ['already_done', 'disagree_with_science', 'knew_something', 'resource_constraint', 'data_looked_wrong', 'other'] as const
export type DecisionReason = (typeof DECISION_REASONS)[number]

export type DecisionError = 'decision' | 'reason' | 'note'

export interface DecisionValue {
  decision: Decision
  reason: DecisionReason | null
  note: string | null
}

const MAX_NOTE = 1000

/**
 * A skip or an edit must say why (spec D1). An edit must also say what was
 * done instead, and the reason "other" must be explained.
 */
export function validateDecision(input: unknown): { ok: true; value: DecisionValue } | { ok: false; error: DecisionError } {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  if (typeof raw.decision !== 'string' || !(DECISIONS as readonly string[]).includes(raw.decision)) return { ok: false, error: 'decision' }
  const decision = raw.decision as Decision
  const note = typeof raw.note === 'string' && raw.note.trim() !== '' ? raw.note.trim().slice(0, MAX_NOTE) : null
  const reasonGiven = typeof raw.reason === 'string' && raw.reason !== ''

  if (decision === 'accepted') return { ok: true, value: { decision, reason: null, note } }
  if (!reasonGiven || !(DECISION_REASONS as readonly string[]).includes(raw.reason as string)) return { ok: false, error: 'reason' }
  const reason = raw.reason as DecisionReason
  if ((decision === 'edited' || reason === 'other') && note === null) return { ok: false, error: 'note' }
  return { ok: true, value: { decision, reason, note } }
}

/** A plan, deferred or unscheduled entry as the daily run stores it in farm_plans. */
export interface StoredPlanEntry {
  actionId: string
  blockId: string
  day?: number
  date?: string
  reason?: string
  detail?: string
  conflicts?: string[]
  logId: string | null
  mode: 'shadow' | 'live'
  action: ProposedAction
}

const show = (v: unknown): string => {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

/** The inputs a rule used, as rows for the "Why" panel. The spray findings are shown on their own. */
export function keyInputs(action: Pick<ProposedAction, 'inputsSnapshot'>): { key: string; value: string }[] {
  const rows: { key: string; value: string }[] = []
  for (const [key, value] of Object.entries(action.inputsSnapshot ?? {})) {
    if (key === 'spray_safeguards') continue
    if (key === 'params' && value && typeof value === 'object') {
      for (const [p, v] of Object.entries(value as Record<string, unknown>)) rows.push({ key: `$${p}`, value: show(v) })
      continue
    }
    rows.push({ key, value: show(value) })
  }
  return rows
}

export interface SprayProductView {
  name: string
  usable: boolean
  /** Why the product is blocked on every day, each with its safeguard. */
  blocked: { safeguardId: string; reason: string }[]
  /** Days from today on which it may be used. */
  openDays: number[]
}

/** The products checked for a spray, with the safeguard findings exactly as recorded. */
export function sprayProducts(action: Pick<ProposedAction, 'inputsSnapshot'>): { products: SprayProductView[]; note: string | null } | null {
  const s = action.inputsSnapshot?.spray_safeguards as
    | { note?: string | null; products?: { name: string; usable: boolean; blocked: { safeguardId: string; reason: string }[]; days: { dayIndex: number; allowedHours: number[] }[] }[] }
    | undefined
  if (!s) return null
  return {
    note: s.note ?? null,
    products: (s.products ?? []).map(p => ({
      name: p.name,
      usable: p.usable,
      blocked: p.blocked ?? [],
      openDays: (p.days ?? []).filter(d => d.allowedHours.length > 0).map(d => d.dayIndex),
    })),
  }
}

export interface LiveReadiness {
  /** False when the pack has no content for the engine: it is inactive for the crop. */
  hasContent: boolean
  canGoLive: boolean
  /** Pack values still to be sourced that keep the engine in Shadow (spec V7). */
  blockers: string[]
}

interface PackReport {
  engines?: Record<string, { hasContent?: boolean; liveBlockedBy?: string[] }>
}

/** Whether an engine may be switched to Live, from the validation reports of the pack versions the farm uses. */
export function liveReadiness(reports: PackReport[], engineId: string): LiveReadiness {
  const entries = reports.map(r => r.engines?.[engineId])
  const hasContent = entries.length > 0 && entries.every(e => e?.hasContent === true)
  const blockers = [...new Set(entries.flatMap(e => e?.liveBlockedBy ?? []))]
  return { hasContent, blockers, canGoLive: hasContent && blockers.length === 0 }
}

interface EngineResult {
  active: boolean
  reason: string | null
  diagnosis: { outcome: string | null; notes: string[] } | null
}

export interface EngineTile {
  /** The growth phase as the pack names it, in words. */
  phase: string | null
  /** Root-zone depletion as a share of the refill point (RAW), in percent; null when no water balance was computed. */
  depletionPct: number | null
  coldestNight: { date: string; minC: number } | null
  expectedYield: number | null
  yieldUnit: string | null
  /** Data-quality flags on the block's state. */
  flags: string[]
  /** Engines that could not decide for the block. */
  waiting: number
}

/** The few values of a block's engine state the dashboard shows. */
export function engineTile(state: unknown, engines: unknown): EngineTile {
  const s = (state && typeof state === 'object' ? state : {}) as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const dr = num(s.Dr)
  const raw = num(s.RAW)
  const nights = (Array.isArray(s.frost_nights) ? s.frost_nights : []) as { date: string; minC: number }[]
  const coldest = nights.reduce<{ date: string; minC: number } | null>((c, n) => (typeof n?.minC === 'number' && (c === null || n.minC < c.minC) ? { date: n.date, minC: n.minC } : c), null)
  return {
    phase: typeof s.phase === 'string' ? s.phase.replace(/_/g, ' ') : null,
    depletionPct: dr !== null && raw !== null && raw > 0 ? (dr / raw) * 100 : null,
    coldestNight: coldest,
    expectedYield: num(s.expected_yield),
    yieldUnit: typeof s.expected_yield_unit === 'string' ? s.expected_yield_unit : null,
    flags: Array.isArray(s.flags) ? s.flags.filter((f): f is string => typeof f === 'string') : [],
    waiting: waitingEngines(engines as Record<string, EngineResult> | null).length,
  }
}

/** The engines that could not decide for a block, with what each says it is missing. */
export function waitingEngines(engines: Record<string, EngineResult> | null | undefined): { engineId: string; notes: string[] }[] {
  return Object.entries(engines ?? {}).flatMap(([engineId, e]) => {
    if (!e.active) return [{ engineId, notes: e.reason ? [e.reason] : [] }]
    if (e.diagnosis && e.diagnosis.outcome === null) return [{ engineId, notes: e.diagnosis.notes }]
    return []
  })
}

/**
 * The calendar category of an engine action, for booking a Live action. Read
 * from the action type's form (spray_*, irrigate*, *_sampling, monitor_*,
 * ...), which is the same for every crop, then from the engine; anything
 * else is booked as "other".
 */
export function categoryForAction(action: Pick<ProposedAction, 'engineId' | 'actionType'>): RecommendationCategory {
  const type = action.actionType
  if (type.startsWith('spray')) return 'spray'
  if (type.startsWith('irrigate')) return 'irrigate'
  if (/(^|_)(sampling|scouting|measurement|observe|monitor)(_|$)/.test(type)) return 'scout'
  if (action.engineId === 'fertigation') return 'fertilize'
  if (action.engineId === 'canopy_pruning') return 'prune'
  return 'other'
}

/** What the manager sends to accept or change a Live action and book it. */
export interface ScheduleDecisionValue extends DecisionValue {
  decision: 'accepted' | 'edited'
  start: string
  durationHours: number | null
}

/** Only accepting or changing books work; a skip is recorded with recordEngineDecision. */
export function validateScheduleDecision(input: unknown): { ok: true; value: ScheduleDecisionValue } | { ok: false; error: DecisionError | 'schedule' } {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  if (raw.decision !== 'accepted' && raw.decision !== 'edited') return { ok: false, error: 'decision' }
  const v = validateDecision(raw)
  if (!v.ok) return v
  const start = typeof raw.start === 'string' ? raw.start : ''
  if (Number.isNaN(Date.parse(start))) return { ok: false, error: 'schedule' }
  const hours = raw.durationHours === null || raw.durationHours === undefined || raw.durationHours === '' ? null : Number(raw.durationHours)
  if (hours !== null && !(Number.isFinite(hours) && hours > 0 && hours <= 24 * 14)) return { ok: false, error: 'schedule' }
  return { ok: true, value: { ...v.value, decision: raw.decision, start, durationHours: hours } }
}

export interface SafeguardEvent {
  actionId: string
  day: number
  safeguardId: string
  reason: string
}

/**
 * What identifies a safeguard finding across days and plans: the safeguard,
 * the action it stopped (block, engine, rule, type) and the reason as
 * recorded. The same finding on several days of the plan, or in tomorrow's
 * plan, has the same key, so one acknowledgement covers it; a new reason is a
 * new finding.
 */
export function safeguardEventKey(event: Pick<SafeguardEvent, 'safeguardId' | 'reason'>, action: Pick<ProposedAction, 'blockId' | 'engineId' | 'ruleId' | 'actionType'>): string {
  return [event.safeguardId, action.blockId, action.engineId, action.ruleId, action.actionType, event.reason].join('|')
}

export interface PinnedSafeguard {
  key: string
  safeguardId: string
  reason: string
  blockId: string
  actionId: string
  /** Plan days the finding applies to. */
  days: number[]
}

/** The findings not yet acknowledged, one per key, in the order the plan recorded them. */
export function pinnedSafeguards(events: SafeguardEvent[], actions: Map<string, Pick<ProposedAction, 'blockId' | 'engineId' | 'ruleId' | 'actionType'>>, acknowledged: Set<string>): PinnedSafeguard[] {
  const byKey = new Map<string, PinnedSafeguard>()
  for (const e of events) {
    const action = actions.get(e.actionId)
    if (!action) continue
    const key = safeguardEventKey(e, action)
    if (acknowledged.has(key)) continue
    const seen = byKey.get(key)
    if (seen) {
      if (!seen.days.includes(e.day)) seen.days.push(e.day)
      continue
    }
    byKey.set(key, { key, safeguardId: e.safeguardId, reason: e.reason, blockId: action.blockId, actionId: e.actionId, days: [e.day] })
  }
  return [...byKey.values()]
}
