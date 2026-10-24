/**
 * The frost check between daily runs: every two hours, the frost engine is
 * run again on a fresh forecast and the farm's latest station reading, so a
 * colder night than the morning forecast showed is caught in time. Only the
 * frost engine runs; the block's phase, variety and margins come from the
 * block state the daily run stored.
 *
 * Pure: loading, saving and alerts are in utils/decision/run-frost-check.ts.
 */

import type { BlockState, ProposedAction } from '../framework/types'
import type { PackContext } from '../pack/context'
import { frostEngine, type FrostNight } from './frost'

export type FrostCheckLevel = 'none' | 'watch' | 'warning' | 'critical'

/**
 * Tonight judged on the station as well as the forecast. A station reading
 * taken today that is colder than the forecast for the rest of today lowers
 * today's minimum to it: the day cannot end warmer than a temperature already
 * reached. Only the latest reading counts, so a frost already over does not
 * keep asking for protection.
 */
export function withStationReading(nights: FrostNight[], today: string, reading: { tempC: number; at: string; localDate: string } | null): FrostNight[] {
  if (!reading || reading.localDate !== today) return nights
  const station = { tempC: reading.tempC, at: reading.at }
  const tonight = nights.find(n => n.dayIndex === 0)
  if (!tonight) return [{ date: today, dayIndex: 0, minC: reading.tempC, station }, ...nights]
  if (reading.tempC >= tonight.minC) return nights
  return nights.map(n => (n === tonight ? { ...n, minC: reading.tempC, forecastMinC: n.minC, station } : n))
}

export interface FrostCheckResult {
  /** Why the engine did not assess the block, e.g. a phase in which frost is not assessed. */
  inactiveReason: string | null
  level: FrostCheckLevel
  /** The night the level was judged on. */
  worstNight: FrostNight | null
  actions: ProposedAction[]
  notes: string[]
}

const LEVEL_OF_RULE: Record<string, FrostCheckLevel> = { 'FROST-WATCH': 'watch', 'FROST-WARNING': 'warning', 'FROST-CRITICAL': 'critical' }
const RANK: Record<FrostCheckLevel, number> = { none: 0, watch: 1, warning: 2, critical: 3 }

/** Runs the frost engine on the stored state with the new nights. */
export function runFrostCheck(blockId: string, stored: BlockState, nights: FrostNight[], pack: PackContext, now: Date = new Date()): FrostCheckResult {
  const state: BlockState = { ...stored, frost_nights: nights }
  const diagnosis = frostEngine.diagnose?.(state, pack) ?? { ruleId: null, outcome: null, skipped: [], notes: [] }
  if (diagnosis.outcome === null) return { inactiveReason: diagnosis.notes[0] ?? 'Frost could not be assessed', level: 'none', worstNight: null, actions: [], notes: diagnosis.notes }
  const level = (diagnosis.ruleId ? LEVEL_OF_RULE[diagnosis.ruleId] : undefined) ?? 'none'
  const worstNight = nights.reduce<FrostNight | null>((w, n) => (w === null || n.minC < w.minC ? n : w), null)
  return { inactiveReason: null, level, worstNight, actions: frostEngine.evaluate(blockId, state, pack, now), notes: diagnosis.notes }
}

/** The frost level of each night the actions cover. */
export function levelsByNight(actions: ProposedAction[]): Map<string, { level: FrostCheckLevel; action: ProposedAction }> {
  const out = new Map<string, { level: FrostCheckLevel; action: ProposedAction }>()
  for (const a of actions) {
    if (a.actionType === 'frost_damage_scouting') continue
    const night = a.inputsSnapshot?.night
    const level = LEVEL_OF_RULE[a.ruleId]
    if (typeof night !== 'string' || !level) continue
    const seen = out.get(night)
    if (!seen || RANK[level] > RANK[seen.level]) out.set(night, { level, action: a })
  }
  return out
}

export const FROST_ALERT_RULE = 'engine_frost'

export interface FrostAlert {
  dedupKey: string
  night: string
  severity: 'warning' | 'critical'
  message: string
  details: Record<string, unknown>
}

/**
 * Alerts for a block whose frost engine is Live: one per night at warning or
 * critical. A change of level is a new alert and the old one is closed, so a
 * worsening night notifies again; a night that is no longer at risk, or has
 * passed, has its alert closed.
 */
export function frostAlertChanges(
  actions: ProposedAction[],
  open: { id: string; dedupKey: string | null }[],
  today: string,
): { create: FrostAlert[]; resolve: string[] } {
  const wanted = new Map<string, FrostAlert>()
  for (const [night, { level, action }] of levelsByNight(actions)) {
    if ((level !== 'warning' && level !== 'critical') || night < today) continue
    const dedupKey = `${FROST_ALERT_RULE}:${night}:${level}`
    wanted.set(dedupKey, { dedupKey, night, severity: level, message: action.description, details: { ...action.inputsSnapshot, rule_id: action.ruleId, pack_id: action.packId, pack_version: action.packVersion } })
  }
  const openKeys = new Set(open.map(o => o.dedupKey))
  return {
    create: [...wanted.values()].filter(a => !openKeys.has(a.dedupKey)),
    resolve: open.filter(o => !o.dedupKey || !wanted.has(o.dedupKey)).map(o => o.id),
  }
}
