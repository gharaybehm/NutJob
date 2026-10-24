'use server'

/* eslint-disable @typescript-eslint/no-explicit-any -- the decision-engine tables postdate the generated Supabase types */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireFarmRole } from '@/utils/supabase/farm-access'
import { ENGINE_IDS, type EngineId } from '@/engines/pack/schema'
import type { Narration } from '@/engines/narrator/narration'
import { categoryForAction, liveReadiness, pinnedSafeguards, safeguardEventKey, validateDecision, validateScheduleDecision, waitingEngines, type PinnedSafeguard, type SafeguardEvent, type Decision, type DecisionError, type DecisionReason, type LiveReadiness, type StoredPlanEntry } from '@/utils/decision/plan-view'
import { bookCalendarEvent } from '@/utils/recommendation-schedule'
import type { ProposedAction } from '@/engines/framework/types'

/**
 * The decision engine's plan for a farm, as the Recommendations page shows
 * it, and the manager's side of it. Supervisors and admins only: plan text is
 * farm data and is never shown to the platform operator. Row-level security
 * enforces the same.
 */

export interface RecordedDecision {
  decision: Decision
  reason: DecisionReason | null
  note: string | null
  decidedAt: string
}

export interface EngineModeView extends LiveReadiness {
  packId: string
  engineId: EngineId
  mode: 'shadow' | 'live'
}

export interface EnginePlanView {
  /** 'none' when the daily run has produced no plan yet; 'unavailable' when it could not be read. */
  status: 'ok' | 'none' | 'unavailable' | 'forbidden'
  planDate: string | null
  planStatus: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | null
  planned: StoredPlanEntry[]
  deferred: StoredPlanEntry[]
  unscheduledMandatory: StoredPlanEntry[]
  /** Every safeguard veto applied, exactly as recorded. */
  safeguardEvents: { actionId: string; day: number; safeguardId: string; reason: string }[]
  notes: string[]
  narration: Narration | null
  narrationSource: 'model' | 'rules' | null
  blockNames: Record<string, string>
  /** The latest decision recorded on each log row. */
  decisions: Record<string, RecordedDecision>
  /** Per block, the engines that could not decide and what each is missing. */
  waiting: { blockId: string; engines: { engineId: string; notes: string[] }[] }[]
  modes: EngineModeView[]
  /** Only a farm admin switches an engine between Shadow and Live. */
  canSetModes: boolean
  /** Calendar events booked from Live actions, by log row. */
  bookings: Record<string, Booking>
  /** Safeguard findings in the plan nobody has acknowledged yet. */
  pinned: PinnedSafeguard[]
  /** The latest frost check of each block checked in the last day (every two hours while frost is assessed). */
  frostChecks: FrostCheckView[]
}

export interface Booking {
  eventId: string
  start: string
  completedAt: string | null
}

export interface FrostCheckView {
  blockId: string
  checkedAt: string
  level: 'none' | 'watch' | 'warning' | 'critical'
  worstNight: string | null
  worstMinC: number | null
  /** The station reading the check used, when it was colder than the forecast. */
  stationC: number | null
}

const EMPTY: Omit<EnginePlanView, 'status'> = {
  planDate: null,
  planStatus: null,
  planned: [],
  deferred: [],
  unscheduledMandatory: [],
  safeguardEvents: [],
  notes: [],
  narration: null,
  narrationSource: null,
  blockNames: {},
  decisions: {},
  waiting: [],
  modes: [],
  canSetModes: false,
  bookings: {},
  frostChecks: [],
  pinned: [],
}

const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

/** The pack ids the farm's blocks are bound to, with the validation report of each version in use. */
async function farmPackReports(supabase: any, farmId: string): Promise<Map<string, any[]>> {
  const { data: blocks } = await supabase.from('blocks').select('pack_id, pack_version').eq('farm_id', farmId)
  const versions = new Set<string>((blocks ?? []).filter((b: any) => b.pack_id && b.pack_version).map((b: any) => `${b.pack_id}@${b.pack_version}`))
  const reports = new Map<string, any[]>()
  for (const key of versions) {
    const [packId, version] = key.split('@')
    const { data } = await supabase.from('crop_packs').select('report').eq('pack_id', packId).eq('version', version).maybeSingle()
    reports.set(packId, [...(reports.get(packId) ?? []), data?.report ?? {}])
  }
  return reports
}

export async function getEnginePlan(farmId: string): Promise<EnginePlanView> {
  const gate = await requireFarmRole(farmId, 'supervisor')
  if (!gate.ok) return { status: 'forbidden', ...EMPTY }
  const supabase = (await createClient()) as any

  const [{ data: blocks }, { data: modeRows }, reports] = await Promise.all([
    supabase.from('blocks').select('id, name').eq('farm_id', farmId),
    supabase.from('farm_engine_modes').select('pack_id, engine_id, mode').eq('farm_id', farmId),
    farmPackReports(supabase, farmId),
  ])
  const blockNames: Record<string, string> = Object.fromEntries((blocks ?? []).map((b: any) => [b.id, b.name]))
  const modes: EngineModeView[] = [...reports.entries()].flatMap(([packId, packReports]) =>
    ENGINE_IDS.map(engineId => ({
      packId,
      engineId,
      mode: (modeRows ?? []).some((m: any) => m.pack_id === packId && m.engine_id === engineId && m.mode === 'live') ? ('live' as const) : ('shadow' as const),
      ...liveReadiness(packReports, engineId),
    })),
  )
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString()
  const { data: checkRows } = await supabase
    .from('frost_checks')
    .select('block_id, checked_at, level, worst_night, worst_min_c, station')
    .eq('farm_id', farmId)
    .gte('checked_at', since)
    .order('checked_at', { ascending: false })
  const frostChecks: FrostCheckView[] = []
  for (const c of checkRows ?? []) {
    if (frostChecks.some(f => f.blockId === c.block_id)) continue
    frostChecks.push({
      blockId: c.block_id,
      checkedAt: c.checked_at,
      level: c.level,
      worstNight: c.worst_night ? String(c.worst_night).slice(0, 10) : null,
      worstMinC: c.worst_min_c === null ? null : Number(c.worst_min_c),
      stationC: c.station && typeof c.station.tempC === 'number' ? c.station.tempC : null,
    })
  }
  const base = { ...EMPTY, blockNames, modes, canSetModes: gate.actor.role === 'admin', frostChecks }

  const { data: plan, error } = await supabase.from('farm_plans').select('*').eq('farm_id', farmId).order('plan_date', { ascending: false }).limit(1).maybeSingle()
  if (error) return { status: 'unavailable', ...base }
  if (!plan) return { status: 'none', ...base }

  const planned = list<StoredPlanEntry>(plan.plan).filter(e => e.action)
  const deferred = list<StoredPlanEntry>(plan.deferred).filter(e => e.action)
  const unscheduledMandatory = list<StoredPlanEntry>(plan.unscheduled_mandatory).filter(e => e.action)

  const logIds = [...planned, ...deferred, ...unscheduledMandatory].map(e => e.logId).filter((id): id is string => typeof id === 'string')
  const decisions: Record<string, RecordedDecision> = {}
  if (logIds.length > 0) {
    // Newest first, so the first row seen per recommendation is the decision that stands.
    const { data: rows } = await supabase
      .from('engine_recommendation_decisions')
      .select('log_id, decision, reason, note, decided_at')
      .in('log_id', logIds)
      .order('decided_at', { ascending: false })
    for (const r of rows ?? []) {
      if (!decisions[r.log_id]) decisions[r.log_id] = { decision: r.decision, reason: r.reason ?? null, note: r.note ?? null, decidedAt: r.decided_at }
    }
  }

  const bookings: Record<string, Booking> = {}
  if (logIds.length > 0) {
    const { data: events } = await supabase
      .from('calendar_events')
      .select('id, start_date, completed_at, details')
      .eq('farm_id', farmId)
      .in('details->>engine_log_id', logIds)
    for (const e of events ?? []) {
      const logId = e.details?.engine_log_id
      if (typeof logId === 'string') bookings[logId] = { eventId: e.id, start: e.start_date, completedAt: e.completed_at ?? null }
    }
  }

  const safeguardEvents = list<SafeguardEvent>(plan.safeguard_events)
  const actionsById = new Map([...planned, ...deferred, ...unscheduledMandatory].map(e => [e.actionId, e.action]))
  const { data: acks } = await supabase.from('safeguard_acknowledgements').select('event_key').eq('farm_id', farmId)
  const pinned = pinnedSafeguards(safeguardEvents, actionsById, new Set((acks ?? []).map((a: any) => a.event_key)))

  const { data: states } = await supabase.from('block_engine_state').select('block_id, engines').eq('farm_id', farmId).eq('state_date', plan.plan_date)
  const waiting = (states ?? []).map((s: any) => ({ blockId: s.block_id as string, engines: waitingEngines(s.engines) })).filter((w: { engines: unknown[] }) => w.engines.length > 0)

  return {
    ...base,
    status: 'ok',
    planDate: String(plan.plan_date).slice(0, 10),
    planStatus: plan.status,
    planned,
    deferred,
    unscheduledMandatory,
    safeguardEvents,
    notes: list<string>(plan.notes),
    narration: plan.narration ?? null,
    narrationSource: plan.narration_source ?? null,
    decisions,
    waiting,
    bookings,
    pinned,
  }
}

export type AcknowledgeResult = { ok: true } | { ok: false; error: 'forbidden' | 'notFound' | 'failed' }

/**
 * Acknowledges a safeguard finding of the farm's latest plan, so it is no
 * longer pinned. The safeguard still applies; this records only that someone
 * has seen it.
 */
export async function acknowledgeSafeguard(farmId: string, key: string): Promise<AcknowledgeResult> {
  const gate = await requireFarmRole(farmId, 'supervisor')
  if (!gate.ok) return { ok: false, error: 'forbidden' }
  const supabase = (await createClient()) as any
  const { data: plan } = await supabase.from('farm_plans').select('plan_date, plan, deferred, unscheduled_mandatory, safeguard_events').eq('farm_id', farmId).order('plan_date', { ascending: false }).limit(1).maybeSingle()
  if (!plan) return { ok: false, error: 'notFound' }
  const entries = [...list<StoredPlanEntry>(plan.plan), ...list<StoredPlanEntry>(plan.deferred), ...list<StoredPlanEntry>(plan.unscheduled_mandatory)].filter(e => e.action)
  const actionsById = new Map(entries.map(e => [e.actionId, e.action]))
  // Only a finding the plan actually holds can be acknowledged.
  const event = list<SafeguardEvent>(plan.safeguard_events).find(e => {
    const action = actionsById.get(e.actionId)
    return action && safeguardEventKey(e, action) === key
  })
  const action = event ? actionsById.get(event.actionId) : undefined
  if (!event || !action) return { ok: false, error: 'notFound' }

  const { error } = await supabase.from('safeguard_acknowledgements').insert({
    farm_id: farmId,
    block_id: action.blockId,
    event_key: key,
    safeguard_id: event.safeguardId,
    plan_date: String(plan.plan_date).slice(0, 10),
    acknowledged_by: gate.actor.userId,
  })
  // 23505: someone acknowledged it already, which is the outcome asked for.
  if (error && error.code !== '23505') return { ok: false, error: 'failed' }
  revalidatePath(`/${farmId}/recommendations`)
  return { ok: true }
}

export type DecisionResult = { ok: true } | { ok: false; error: DecisionError | 'forbidden' | 'notFound' | 'failed' }

/** Records what the manager decided about a logged recommendation. A change of mind is a new entry. */
export async function recordEngineDecision(farmId: string, logId: string, input: unknown): Promise<DecisionResult> {
  const gate = await requireFarmRole(farmId, 'supervisor')
  if (!gate.ok) return { ok: false, error: 'forbidden' }
  const v = validateDecision(input)
  if (!v.ok) return { ok: false, error: v.error }

  const supabase = (await createClient()) as any
  // The recommendation must be one of this farm's; its mode is recorded with the decision.
  const { data: log } = await supabase.from('engine_recommendation_log').select('id, block_id, mode').eq('id', logId).eq('farm_id', farmId).maybeSingle()
  if (!log) return { ok: false, error: 'notFound' }

  const { error } = await supabase.from('engine_recommendation_decisions').insert({
    farm_id: farmId,
    log_id: log.id,
    block_id: log.block_id,
    decision: v.value.decision,
    reason: v.value.reason,
    note: v.value.note,
    mode: log.mode,
    decided_by: gate.actor.userId,
  })
  if (error) return { ok: false, error: 'failed' }
  revalidatePath(`/${farmId}/recommendations`)
  return { ok: true }
}

export type ScheduleResult = { ok: true } | { ok: false; error: DecisionError | 'schedule' | 'forbidden' | 'notFound' | 'notLive' | 'booked' | 'failed' }

/**
 * Accepts or changes a Live action and books it on the calendar, through the
 * same booking as an accepted weekly card. Only an engine the farm has
 * switched to Live can book work; a Shadow action is recorded with
 * recordEngineDecision and never reaches the calendar. Nothing about the
 * block changes until the event is logged as done.
 */
export async function scheduleEngineAction(farmId: string, logId: string, input: unknown): Promise<ScheduleResult> {
  const gate = await requireFarmRole(farmId, 'supervisor')
  if (!gate.ok) return { ok: false, error: 'forbidden' }
  const v = validateScheduleDecision(input)
  if (!v.ok) return { ok: false, error: v.error }

  const supabase = (await createClient()) as any
  const { data: log } = await supabase.from('engine_recommendation_log').select('id, block_id, pack_id, engine_id, action').eq('id', logId).eq('farm_id', farmId).maybeSingle()
  if (!log) return { ok: false, error: 'notFound' }
  const { data: mode } = await supabase.from('farm_engine_modes').select('mode').eq('farm_id', farmId).eq('pack_id', log.pack_id).eq('engine_id', log.engine_id).maybeSingle()
  if (mode?.mode !== 'live') return { ok: false, error: 'notLive' }
  const { data: existing } = await supabase.from('calendar_events').select('id').eq('farm_id', farmId).eq('details->>engine_log_id', log.id).limit(1)
  if ((existing ?? []).length > 0) return { ok: false, error: 'booked' }

  const action = log.action as ProposedAction
  // A changed action is booked under what the manager says will be done instead.
  const title = v.value.decision === 'edited' && v.value.note ? v.value.note : action.description
  let eventId: string
  try {
    eventId = await bookCalendarEvent(
      farmId,
      gate.actor.userId,
      {
        title: title.slice(0, 200),
        category: categoryForAction(action),
        block_id: log.block_id,
        notes: `${action.description} (${action.ruleId}, ${action.packId} ${action.packVersion})`,
        details: { source: 'engine', engine_log_id: log.id, engine_id: action.engineId, rule_id: action.ruleId },
      },
      { start: v.value.start, durationHours: v.value.durationHours ?? undefined },
    )
  } catch {
    return { ok: false, error: 'failed' }
  }

  const { error } = await supabase.from('engine_recommendation_decisions').insert({
    farm_id: farmId,
    log_id: log.id,
    block_id: log.block_id,
    decision: v.value.decision,
    reason: v.value.reason,
    note: v.value.note,
    mode: 'live',
    decided_by: gate.actor.userId,
  })
  if (error) {
    // No booking without its decision.
    await (createAdminClient().from('calendar_events') as any).delete().eq('id', eventId).eq('farm_id', farmId)
    return { ok: false, error: 'failed' }
  }
  revalidatePath(`/${farmId}/recommendations`)
  revalidatePath(`/${farmId}/calendar`)
  return { ok: true }
}

export type ModeResult = { ok: true } | { ok: false; error: 'forbidden' | 'engine' | 'blocked' | 'failed'; blockers?: string[] }

/**
 * Switches an engine between Shadow and Live for one crop pack on a farm.
 * The farm admin's decision. Live is refused while the pack lists a value the
 * engine needs as still to be sourced, or has no content for the engine.
 */
export async function setEngineMode(farmId: string, packId: string, engineId: string, mode: 'shadow' | 'live'): Promise<ModeResult> {
  const gate = await requireFarmRole(farmId, 'admin')
  if (!gate.ok) return { ok: false, error: 'forbidden' }
  if (!(ENGINE_IDS as readonly string[]).includes(engineId) || (mode !== 'shadow' && mode !== 'live')) return { ok: false, error: 'engine' }

  const supabase = (await createClient()) as any
  const reports = (await farmPackReports(supabase, farmId)).get(packId)
  if (!reports) return { ok: false, error: 'engine' }
  if (mode === 'live') {
    const readiness = liveReadiness(reports, engineId)
    if (!readiness.canGoLive) return { ok: false, error: 'blocked', blockers: readiness.blockers }
  }

  const { error } = await supabase
    .from('farm_engine_modes')
    .upsert({ farm_id: farmId, pack_id: packId, engine_id: engineId, mode, changed_by: gate.actor.userId, changed_at: new Date().toISOString() }, { onConflict: 'farm_id,pack_id,engine_id' })
  if (error) return { ok: false, error: 'failed' }
  revalidatePath(`/${farmId}/recommendations`)
  return { ok: true }
}
