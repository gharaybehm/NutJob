/**
 * The decision engine on the calendar: a read-only layer beside the farm's
 * events, for supervisors and admins. It shows the seven-day plan, the season
 * tasks falling due, the days a block may not be entered or harvested, the
 * planned harvest and the frost nights. Nothing here is a calendar event:
 * work reaches the calendar only when a Live action is accepted and booked.
 *
 * Plain module, so the client components can use the types and helpers.
 */

import type { ProposedAction } from '@/engines/framework/types'
import { levelsByNight, type FrostCheckLevel } from '@/engines/decision/frost-check'
import type { StoredPlanEntry } from './plan-view'

export type LayerKind = 'planned' | 'season_task' | 'reentry' | 'preharvest' | 'harvest_planned' | 'frost_night'

export interface LayerItem {
  id: string
  kind: LayerKind
  blockId: string
  /** First and last day, YYYY-MM-DD, both included. */
  start: string
  end: string
  /** Engine text, in English, as on the Recommendations page. */
  title: string
  mode: 'shadow' | 'live' | null
  level: FrostCheckLevel | null
}

/** The engines whose tasks come from the pack's season templates. */
const SEASONAL_ENGINES = ['pollination', 'canopy_pruning', 'weed_groundcover', 'harvest'] as const

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)

export interface NightLevel {
  night: string
  level: FrostCheckLevel
  description: string
}

/** What a frost check stores per night, from the actions the frost engine proposed. */
export function nightLevels(actions: ProposedAction[]): NightLevel[] {
  return [...levelsByNight(actions)].map(([night, { level, action }]) => ({ night, level, description: action.description }))
}

export interface LayerInput {
  /** The latest farm plan: its date and the entries it placed. */
  plan: { planDate: string; planned: StoredPlanEntry[] } | null
  /** The latest stored state of each block. */
  states: { blockId: string; stateDate: string; state: Record<string, unknown> }[]
  /** Per block, the night levels of its latest frost check (every two hours). */
  frostChecks: { blockId: string; nights: NightLevel[] }[]
  /** The farm's local date. */
  today: string
}

export function buildEngineLayer(input: LayerInput): LayerItem[] {
  const items: LayerItem[] = []
  const base = { mode: null, level: null }

  for (const e of input.plan?.planned ?? []) {
    if (!e.action || !e.date) continue
    // Frost nights are shown from the latest frost check below.
    if (e.action.engineId === 'frost') continue
    items.push({ ...base, id: `plan:${e.actionId}`, kind: 'planned', blockId: e.blockId, start: e.date, end: e.date, title: e.action.description, mode: e.mode })
  }

  for (const { blockId, stateDate, state } of input.states) {
    for (const engine of SEASONAL_ENGINES) {
      const plan = state[`${engine}_plan`] as { due?: { templateId: string; task: string; earliestDay: number; latestDay: number }[] } | undefined
      for (const t of plan?.due ?? []) {
        const end = addDays(stateDate, t.latestDay)
        if (end < input.today) continue
        items.push({ ...base, id: `season:${blockId}:${engine}:${t.templateId}`, kind: 'season_task', blockId, start: addDays(stateDate, t.earliestDay), end, title: t.task })
      }
    }
    const reentry = state.reentry_blocked_until
    if (isDate(reentry) && reentry.slice(0, 10) >= input.today) {
      items.push({ ...base, id: `reentry:${blockId}`, kind: 'reentry', blockId, start: input.today, end: reentry.slice(0, 10), title: '' })
    }
    const phiClear = (state.harvest as { phiClearFrom?: unknown } | undefined)?.phiClearFrom
    if (isDate(phiClear) && phiClear.slice(0, 10) > input.today) {
      items.push({ ...base, id: `preharvest:${blockId}`, kind: 'preharvest', blockId, start: input.today, end: addDays(phiClear.slice(0, 10), -1), title: '' })
    }
    const harvest = state.planned_harvest_date
    if (isDate(harvest) && harvest.slice(0, 10) >= input.today) {
      items.push({ ...base, id: `harvest:${blockId}`, kind: 'harvest_planned', blockId, start: harvest.slice(0, 10), end: harvest.slice(0, 10), title: '' })
    }
  }

  // Frost nights: a block's latest frost check, or the plan's frost actions when the block has no recent check.
  const checked = new Map(input.frostChecks.map(c => [c.blockId, c.nights]))
  const fromPlan = new Map<string, ProposedAction[]>()
  for (const e of input.plan?.planned ?? []) {
    if (e.action?.engineId === 'frost' && !checked.has(e.blockId)) fromPlan.set(e.blockId, [...(fromPlan.get(e.blockId) ?? []), e.action])
  }
  const nightsByBlock = new Map([...checked, ...[...fromPlan].map(([b, actions]) => [b, nightLevels(actions)] as const)])
  for (const [blockId, nights] of nightsByBlock) {
    for (const n of nights) {
      if (n.night < input.today) continue
      items.push({ id: `frost:${blockId}:${n.night}`, kind: 'frost_night', blockId, start: n.night, end: n.night, title: n.description, mode: null, level: n.level })
    }
  }
  return items
}

/** The items that cover a day (YYYY-MM-DD). */
export function itemsOnDate(items: LayerItem[], date: string): LayerItem[] {
  return items.filter(i => i.start <= date && date <= i.end)
}

/** A Date's calendar day in the browser's timezone, as YYYY-MM-DD. */
export function localDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
