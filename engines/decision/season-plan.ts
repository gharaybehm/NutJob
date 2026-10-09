/**
 * Season plans (CDSS spec §A5.5): the seasonal engines produce dated tasks
 * from the pack's templates, place them by phenology, a dated event or the
 * calendar, and hold a weather-gated task until the forecast gives it a dry
 * window. This module is the part the four seasonal engines share.
 *
 * A task is proposed once in a season, when it first falls due, not again
 * on every run.
 */

import type { BlockState, EnginePublication, ProposedAction } from '../framework/types'
import type { PackContext } from '../pack/context'
import type { EngineId, Pack } from '../pack/schema'
import { proposeAction, stateFlags } from './action'
import { carriedModels, carriedModelsValue, fieldData, sprayOptions } from './field-data'
import { addDays, daysBetween } from './weather'

type SeasonalSection = NonNullable<NonNullable<Pack['seasonal']>[keyof NonNullable<Pack['seasonal']>]>
type Template = SeasonalSection['templates'][number]

export interface DueTask {
  templateId: string
  task: string
  /** Days from today. */
  earliestDay: number
  latestDay: number
  sprayTarget: string | null
  evidence: string | null
  notes: string[]
}

export interface SeasonPlan {
  due: DueTask[]
  /** Tasks held back, and why. */
  notes: string[]
}

/** A task is proposed when its window opens within this many days. */
const PLAN_AHEAD_DAYS = 7

const number = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const season = (state: BlockState) => Number(String(state.date).slice(0, 4))

/** True when this key was already proposed this season. */
export function proposedThisSeason(state: BlockState, key: string): boolean {
  return carriedModels(state).seasonal?.[key] === season(state)
}

/** The publication that records keys as proposed this season. */
export function markProposed(state: BlockState, keys: string[]): Record<string, unknown> {
  const carried = carriedModels(state)
  const seasonal = { ...(carried.seasonal ?? {}) }
  for (const key of keys) seasonal[key] = season(state)
  return carriedModelsValue({ ...carried, seasonal })
}

/** The dated event a template is anchored to: a recorded phenology event, or the planned harvest. */
function eventDate(state: BlockState, event: string): string | null {
  if (event === 'planned_harvest') return typeof state.planned_harvest_date === 'string' ? state.planned_harvest_date : null
  return fieldData(state).events[event] ?? null
}

function window(template: Template, state: BlockState): { earliestDay: number; latestDay: number } | { waiting: string } {
  const today = String(state.date)
  const a = template.anchor
  if (a.type === 'phase') {
    return state.phase === a.phase ? { earliestDay: 0, latestDay: PLAN_AHEAD_DAYS } : { waiting: `the ${a.phase} phase` }
  }
  if (a.type === 'months') {
    const month = Number(today.slice(5, 7))
    if (!a.months.includes(month)) return { waiting: `month ${a.months.join(', ')}` }
    const nextMonth = month === 12 ? `${Number(today.slice(0, 4)) + 1}-01-01` : `${today.slice(0, 4)}-${String(month + 1).padStart(2, '0')}-01`
    return { earliestDay: 0, latestDay: daysBetween(today, nextMonth) - 1 }
  }
  const date = eventDate(state, a.event)
  if (date === null) return { waiting: `a ${a.event} date` }
  const earliestDay = daysBetween(today, addDays(date, a.offset_days[0]))
  const latestDay = daysBetween(today, addDays(date, a.offset_days[1]))
  if (latestDay < 0) return { waiting: 'next season: its window has passed' }
  if (earliestDay > PLAN_AHEAD_DAYS) return { waiting: `${earliestDay} days until its window opens` }
  return { earliestDay: Math.max(0, earliestDay), latestDay }
}

/** The first day in the window from which the forecast shows `dryDays` days without rain; null when there is none. */
function firstDryDay(state: BlockState, earliestDay: number, latestDay: number, dryDays: number): number | null {
  const today = String(state.date)
  const rainByDate = new Map(fieldData(state).daily.filter(d => d.date >= today).map(d => [d.date, d.rainMm]))
  for (let day = earliestDay; day <= latestDay; day++) {
    let dry = true
    for (let i = 0; i < Math.ceil(dryDays); i++) {
      const rain = rainByDate.get(addDays(today, day + i))
      // A day the forecast does not reach cannot be counted as dry.
      if (rain === undefined || rain > 0) {
        dry = false
        break
      }
    }
    if (dry) return day
  }
  return null
}

/** The tasks of one seasonal engine that fall due now and have not been proposed this season. */
export function seasonPlan(engineId: EngineId, section: SeasonalSection | undefined, state: BlockState, pack: PackContext): SeasonPlan {
  const plan: SeasonPlan = { due: [], notes: [] }
  if (!section) return plan
  const age = number(state.age_years)

  for (const t of section.templates) {
    if (t.age) {
      if (age === null) {
        plan.notes.push(`${t.id}: the planting year of the block is not known`)
        continue
      }
      if ((t.age.min_years !== undefined && age < t.age.min_years) || (t.age.max_years !== undefined && age > t.age.max_years)) continue
    }
    if (proposedThisSeason(state, `${engineId}:${t.id}`)) continue

    const w = window(t, state)
    if ('waiting' in w) {
      plan.notes.push(`${t.id}: waiting for ${w.waiting}`)
      continue
    }

    const notes: string[] = []
    let earliestDay = w.earliestDay
    if (t.dry_days) {
      const dryDays = number(pack.params[t.dry_days.slice(1)])
      if (dryDays === null) {
        notes.push(`The dry-weather window is not checked: ${t.dry_days} is still to be sourced`)
      } else {
        const dry = firstDryDay(state, w.earliestDay, w.latestDay, dryDays)
        if (dry === null) {
          plan.notes.push(`${t.id}: held, the forecast shows no ${dryDays} dry day(s) in its window`)
          continue
        }
        earliestDay = dry
      }
    }
    plan.due.push({ templateId: t.id, task: t.task, earliestDay, latestDay: Math.max(earliestDay, w.latestDay), sprayTarget: t.spray_target ?? null, evidence: t.evidence ?? null, notes })
  }
  return plan
}

/** The publication for a plan: the plan itself, and its tasks recorded as proposed. */
export function publishPlan(engineId: EngineId, plan: SeasonPlan, state: BlockState, extra: Record<string, unknown> = {}, extraKeys: string[] = []): EnginePublication {
  // A spraying task is not recorded as proposed: it is checked against the safeguards afresh every day while it is due.
  const keys = [...plan.due.filter(t => t.sprayTarget === null).map(t => `${engineId}:${t.templateId}`), ...extraKeys]
  return { values: { [`${engineId}_plan`]: plan, ...extra, ...markProposed(state, keys) } }
}

export function planOf(engineId: EngineId, state: BlockState): SeasonPlan {
  return (state[`${engineId}_plan`] as SeasonPlan | undefined) ?? { due: [], notes: [] }
}

/** The proposed actions for a plan's due tasks. A task that sprays carries the products and their safeguard findings. */
export function planActions(engineId: EngineId, blockId: string, state: BlockState, pack: PackContext): ProposedAction[] {
  return planOf(engineId, state).due.map(t => {
    const options = t.sprayTarget ? sprayOptions(state, pack, t.sprayTarget) : null
    const open = options ? options.openDays.filter(d => d >= t.earliestDay && d <= t.latestDay) : []
    return proposeAction({
      engineId,
      ruleId: t.templateId,
      packId: pack.packId,
      packVersion: pack.packVersion,
      blockId,
      actionType: options ? `spray_${t.sprayTarget}` : 'seasonal_task',
      description: [t.task, ...t.notes, options?.note].filter(Boolean).join('. '),
      quantity: options ? 1 : null,
      unit: options ? 'spray application' : null,
      earliestDay: open[0] ?? t.earliestDay,
      latestDay: open[open.length - 1] ?? t.latestDay,
      inputsSnapshot: { template: t.templateId, phase: state.phase, window: [t.earliestDay, t.latestDay], ...(options ? { spray_safeguards: options } : {}) },
      evidence: t.evidence,
      flags: stateFlags(state),
      equipment: options ? ['sprayer'] : [],
      requiresEntry: true,
      standing: options === null,
    })
  })
}
