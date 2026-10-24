/* eslint-disable @typescript-eslint/no-explicit-any -- the decision-engine tables postdate the generated Supabase types */
/**
 * Loads the decision engine's calendar layer (calendar-layer.ts) for a farm.
 * Server only. Reads with the caller's client, so row-level security keeps
 * the plan, states and checks to the farm's admins and supervisors; the
 * calendar page asks only for those roles.
 */
import { buildEngineLayer, type LayerItem, type NightLevel } from './calendar-layer'
import type { StoredPlanEntry } from './plan-view'

const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

export interface EngineCalendarLayer {
  items: LayerItem[]
  blockNames: Record<string, string>
}

export async function loadEngineCalendarLayer(supabase: any, farmId: string, now: Date = new Date()): Promise<EngineCalendarLayer> {
  const [{ data: blocks }, { data: plan }] = await Promise.all([
    supabase.from('blocks').select('id, name').eq('farm_id', farmId),
    supabase.from('farm_plans').select('plan_date, plan').eq('farm_id', farmId).order('plan_date', { ascending: false }).limit(1).maybeSingle(),
  ])
  const blockNames: Record<string, string> = Object.fromEntries((blocks ?? []).map((b: any) => [b.id, b.name]))
  const blockIds = Object.keys(blockNames)
  if (blockIds.length === 0) return { items: [], blockNames }

  const planDate = plan ? String(plan.plan_date).slice(0, 10) : null
  // The farm's local date: the daily run's plan date when it is ahead of UTC.
  const utcToday = now.toISOString().slice(0, 10)
  const today = planDate && planDate > utcToday ? planDate : utcToday

  const { data: stateRows } = await supabase
    .from('block_engine_state')
    .select('block_id, state_date, state')
    .eq('farm_id', farmId)
    .order('state_date', { ascending: false })
    .limit(blockIds.length * 3)
  const states: { blockId: string; stateDate: string; state: Record<string, unknown> }[] = []
  for (const s of stateRows ?? []) {
    if (states.some(x => x.blockId === s.block_id)) continue
    states.push({ blockId: s.block_id, stateDate: String(s.state_date).slice(0, 10), state: s.state ?? {} })
  }

  const since = new Date(now.getTime() - 24 * 3_600_000).toISOString()
  const { data: checks } = await supabase
    .from('frost_checks')
    .select('block_id, night_levels')
    .eq('farm_id', farmId)
    .gte('checked_at', since)
    .order('checked_at', { ascending: false })
  const frostChecks: { blockId: string; nights: NightLevel[] }[] = []
  for (const c of checks ?? []) {
    if (frostChecks.some(x => x.blockId === c.block_id)) continue
    frostChecks.push({ blockId: c.block_id, nights: list<NightLevel>(c.night_levels) })
  }

  const planned = plan ? list<StoredPlanEntry>(plan.plan).filter(e => e.action) : []
  return { items: buildEngineLayer({ plan: planDate ? { planDate, planned } : null, states, frostChecks, today }), blockNames }
}
