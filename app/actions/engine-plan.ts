'use server'

/* eslint-disable @typescript-eslint/no-explicit-any -- the decision-engine tables postdate the generated Supabase types */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { requireFarmRole } from '@/utils/supabase/farm-access'
import { ENGINE_IDS, type EngineId } from '@/engines/pack/schema'
import type { Narration } from '@/engines/narrator/narration'
import { liveReadiness, validateDecision, waitingEngines, type Decision, type DecisionError, type DecisionReason, type LiveReadiness, type StoredPlanEntry } from '@/utils/decision/plan-view'

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
  const base = { ...EMPTY, blockNames, modes, canSetModes: gate.actor.role === 'admin' }

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
    safeguardEvents: list(plan.safeguard_events),
    notes: list<string>(plan.notes),
    narration: plan.narration ?? null,
    narrationSource: plan.narration_source ?? null,
    decisions,
    waiting,
  }
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
