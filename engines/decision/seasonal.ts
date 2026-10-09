/**
 * The four seasonal engines (CDSS spec §A6.8, A6.9, A6.10, A6.12):
 * pollination, canopy and pruning, weeds and groundcover, harvest. Each
 * produces its season plan from the pack's templates (`season-plan.ts`) and
 * adds what is its own:
 *
 *   pollination        hives for the block, and days too poor for pollinator flight
 *   canopy & pruning   a request to measure the canopy the crop coefficient is derived from
 *   weeds              nothing of its own: its tasks, including herbicide through the spray safeguards
 *   harvest            readiness from the pack's maturity indicators, the SG-HAR-1 hold,
 *                      and the pre-harvest irrigation cut-off
 */

import { windAt2m } from '../core/units'
import { preHarvestHold } from '../safeguards/harvest'
import type { PackContext } from '../pack/context'
import type { BlockState, DecisionEngine, EngineDiagnosis, ProposedAction } from '../framework/types'
import { proposeAction, stateFlags } from './action'
import { fieldData } from './field-data'
import { planActions, planOf, proposedThisSeason, publishPlan, seasonPlan } from './season-plan'
import { addDays, daysBetween } from './weather'

const number = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const param = (pack: PackContext, ref: string | undefined): number | null => (ref ? number(pack.params[ref.slice(1)]) : null)

function planDiagnosis(engineId: DecisionEngine['engineId'], state: BlockState, own: string[]): EngineDiagnosis {
  const plan = planOf(engineId, state)
  const notes = [...own, ...plan.due.map(t => `Due: ${t.task}`), ...plan.notes]
  return { ruleId: null, outcome: plan.due.length > 0 ? 'tasks_due' : 'nothing_due', skipped: [], notes }
}

// ─── Pollination ─────────────────────────────────────────────────────────────

/** Local hours in which pollinator flight is judged. */
const FLIGHT_HOURS: [number, number] = [9, 17]
const FLIGHT_HORIZON_DAYS = 3

interface PollinationState {
  selfCompatible: boolean | null
  hivesRecommended: number | null
  /** Coming days with no hour fit for pollinator flight. */
  poorFlightDays: string[]
  notes: string[]
}

function assessPollination(state: BlockState, pack: PackContext): PollinationState {
  const section = pack.pack.seasonal?.pollination
  const notes: string[] = []
  const variety = pack.pack.varieties?.varieties.find(v => v.id === state.variety)
  const selfCompatible = variety?.self_compatible ?? null
  if (selfCompatible === true) notes.push('The variety is self-compatible: hives are optional or at reduced density')
  if (selfCompatible === null) notes.push('Self-compatibility of the block variety is not known')

  const density = param(pack, section?.hive_density_per_ha)
  const area = number(state.area_ha)
  if (section?.hive_density_per_ha && density === null) notes.push(`${section.hive_density_per_ha} is still to be sourced, so no hive number is given`)
  const hivesRecommended = density !== null && area !== null ? Math.ceil(density * area) : null

  const poorFlightDays: string[] = []
  const phase = typeof state.phase === 'string' ? state.phase : null
  if (section && phase !== null && section.bee_protection_phases.includes(phase)) {
    const minTemp = param(pack, section.flight?.min_temp_c)
    const maxWind = param(pack, section.flight?.max_wind_ms)
    if (minTemp === null || maxWind === null) {
      notes.push('Flight weather is not assessed: the pack gives no limits for pollinator flight')
    } else {
      const today = String(state.date)
      for (let day = 0; day <= FLIGHT_HORIZON_DAYS; day++) {
        const date = addDays(today, day)
        const hours = fieldData(state).hours.filter(h => h.forecast && h.localDate === date && h.localHour >= FLIGHT_HOURS[0] && h.localHour <= FLIGHT_HOURS[1])
        if (hours.length === 0) continue
        const fit = hours.some(h => h.tempC !== null && h.tempC >= minTemp && h.wind10mMs !== null && windAt2m(h.wind10mMs, 10) <= maxWind && (h.precipMm ?? 0) === 0)
        if (!fit) poorFlightDays.push(date)
      }
    }
  }
  return { selfCompatible, hivesRecommended, poorFlightDays, notes }
}

export const pollinationEngine: DecisionEngine = {
  engineId: 'pollination',
  engineClass: 'seasonal',
  packRequirements: () => ['seasonal.pollination'],
  requiredState: () => ['date', 'phase', 'variety', 'area_ha'],
  safeguards: () => ['SG-SPR-8'],

  publish(state, pack) {
    const pollination = assessPollination(state, pack)
    const fresh = pollination.poorFlightDays.map(d => `pollination:flight:${d}`).filter(k => !proposedThisSeason(state, k))
    return publishPlan('pollination', seasonPlan('pollination', pack.pack.seasonal?.pollination, state, pack), state, { pollination, pollination_fresh: fresh }, fresh)
  },

  diagnose(state): EngineDiagnosis {
    const p = state.pollination as PollinationState | undefined
    const own = [...(p?.notes ?? [])]
    if (p?.hivesRecommended != null) own.unshift(`${p.hivesRecommended} hive(s) for the block`)
    return planDiagnosis('pollination', state, own)
  },

  evaluate(blockId, state, pack): ProposedAction[] {
    const fresh = Array.isArray(state.pollination_fresh) ? (state.pollination_fresh as string[]) : []
    const today = String(state.date)
    const warnings = fresh.map(key => {
      const date = key.split(':')[2]
      return proposeAction({
        engineId: 'pollination',
        ruleId: 'POLL-FLIGHT-WEATHER',
        packId: pack.packId,
        packVersion: pack.packVersion,
        blockId,
        actionType: 'pollination_weather_warning',
        description: `No hour on ${date} is forecast fit for pollinator flight`,
        earliestDay: daysBetween(today, date),
        latestDay: daysBetween(today, date),
        inputsSnapshot: { phase: state.phase, date },
        evidence: null,
        flags: stateFlags(state),
        standing: true,
      })
    })
    return [...planActions('pollination', blockId, state, pack), ...warnings]
  },
}

// ─── Canopy and pruning ──────────────────────────────────────────────────────

const CANOPY_KEY = 'canopy_pruning:measure_canopy'

export const canopyPruningEngine: DecisionEngine = {
  engineId: 'canopy_pruning',
  engineClass: 'seasonal',
  packRequirements: () => ['seasonal.canopy_pruning'],
  requiredState: () => ['date', 'phase', 'age_years', 'canopy_cover', 'canopy_height_m'],
  safeguards: () => [],

  publish(state, pack) {
    const unmeasured = state.canopy_cover === null || state.canopy_height_m === null
    const fresh = unmeasured && !proposedThisSeason(state, CANOPY_KEY)
    return publishPlan('canopy_pruning', seasonPlan('canopy_pruning', pack.pack.seasonal?.canopy_pruning, state, pack), state, { canopy_measurement_due: fresh }, fresh ? [CANOPY_KEY] : [])
  },

  diagnose(state): EngineDiagnosis {
    const own = state.canopy_cover === null || state.canopy_height_m === null ? ['Canopy cover or height of the block is not measured'] : []
    return planDiagnosis('canopy_pruning', state, own)
  },

  evaluate(blockId, state, pack): ProposedAction[] {
    const actions = planActions('canopy_pruning', blockId, state, pack)
    if (state.canopy_measurement_due === true) {
      actions.push(
        proposeAction({
          engineId: 'canopy_pruning',
          ruleId: 'CANOPY-NOT-MEASURED',
          packId: pack.packId,
          packVersion: pack.packVersion,
          blockId,
          actionType: 'canopy_measurement',
          description: 'Measure the canopy of the block: the fraction of ground it covers near midday, and the tree height',
          earliestDay: 0,
          latestDay: 14,
          inputsSnapshot: { canopy_cover: state.canopy_cover, canopy_height_m: state.canopy_height_m },
          evidence: null,
          expectedOutcome: 'The crop coefficient and the water balance of the block can be computed',
          requiresEntry: true,
          standing: true,
          flags: stateFlags(state),
        }),
      )
    }
    return actions
  },
}

// ─── Weeds and groundcover ───────────────────────────────────────────────────

export const weedGroundcoverEngine: DecisionEngine = {
  engineId: 'weed_groundcover',
  engineClass: 'seasonal',
  packRequirements: () => ['seasonal.weed_groundcover'],
  requiredState: () => ['date', 'phase'],
  safeguards: () => ['SG-SPR-1', 'SG-SPR-2', 'SG-SPR-3', 'SG-SPR-4', 'SG-SPR-5', 'SG-SPR-6', 'SG-SPR-7'],
  publish: (state, pack) => publishPlan('weed_groundcover', seasonPlan('weed_groundcover', pack.pack.seasonal?.weed_groundcover, state, pack), state),
  diagnose: state => planDiagnosis('weed_groundcover', state, []),
  evaluate: (blockId, state, pack) => planActions('weed_groundcover', blockId, state, pack),
}

// ─── Harvest ─────────────────────────────────────────────────────────────────

interface HarvestState {
  /** True or false when every maturity indicator could be judged; null otherwise. */
  ready: boolean | null
  indicators: { observation: string; field: string; value: number | null; readyAt: number | null; met: boolean | null }[]
  /** True once a harvest start is recorded this season. */
  started: boolean
  /** SG-HAR-1: first date every recorded pre-harvest interval has passed, and the re-entry interval in force. */
  phiClearFrom: string | null
  reentryBlockedUntil: string | null
  /** Spray entries whose pre-harvest interval cannot be determined. */
  unknownSprays: number
  /** Days from today before which harvest must not start. */
  holdDays: number
  irrigationCutoff: boolean | null
  notes: string[]
}

const READY_KEY = 'harvest:ready'
const CUTOFF_KEY = 'harvest:irrigation_cutoff'

function assessHarvest(state: BlockState, pack: PackContext): HarvestState {
  const section = pack.pack.seasonal?.harvest
  const data = fieldData(state)
  const today = String(state.date)
  const season = Number(today.slice(0, 4))
  const notes: string[] = []

  const indicators = (section?.maturity ?? []).map(m => {
    const series = data.observations
      .filter(o => o.kind === m.observation && Number(o.observedOn.slice(0, 4)) === season)
      .sort((a, b) => a.observedOn.localeCompare(b.observedOn))
    const value = number(series[series.length - 1]?.values[m.field])
    const readyAt = param(pack, m.ready_at)
    if (readyAt === null) notes.push(`${m.ready_at} is still to be sourced, so readiness cannot be judged`)
    else if (value === null) notes.push(`No ${m.observation} observation this season`)
    const met = value === null || readyAt === null ? null : m.comparison === 'ge' ? value >= readyAt : value <= readyAt
    return { observation: m.observation, field: m.field, value, readyAt, met }
  })
  if (indicators.length === 0) notes.push('The pack gives no maturity indicator')
  const ready = indicators.length === 0 || indicators.some(i => i.met === null) ? null : indicators.every(i => i.met === true)

  const hold = preHarvestHold(data.applications, data.products)
  const reentry = typeof state.reentry_blocked_until === 'string' ? state.reentry_blocked_until : null
  const holdDays = Math.max(0, hold.clearFrom ? daysBetween(today, hold.clearFrom) : 0, reentry ? daysBetween(today, reentry.slice(0, 10)) + 1 : 0)
  if (hold.unknown > 0) notes.push(`The pre-harvest interval of ${hold.unknown} spray entry(ies) cannot be checked: they name no library product, or its label has no interval`)

  const cutoffDays = param(pack, section?.irrigation_cutoff_days)
  const planned = typeof state.planned_harvest_date === 'string' ? state.planned_harvest_date : null
  let irrigationCutoff: boolean | null = null
  if (section?.irrigation_cutoff_days) {
    if (cutoffDays === null) notes.push(`${section.irrigation_cutoff_days} is still to be sourced, so no irrigation cut-off is set`)
    else if (planned === null) notes.push('No planned harvest date, so no irrigation cut-off is set')
    else {
      const days = daysBetween(today, planned)
      irrigationCutoff = days >= 0 && days <= cutoffDays
    }
  }

  return {
    ready,
    indicators,
    started: data.events.harvest_start !== undefined && data.events.harvest_start.slice(0, 4) === String(season),
    phiClearFrom: hold.clearFrom,
    reentryBlockedUntil: reentry,
    unknownSprays: hold.unknown,
    holdDays,
    irrigationCutoff,
    notes,
  }
}

export const harvestEngine: DecisionEngine = {
  engineId: 'harvest',
  engineClass: 'seasonal',
  packRequirements: () => ['seasonal.harvest'],
  requiredState: () => ['date', 'phase', 'planned_harvest_date', 'reentry_blocked_until'],
  safeguards: () => ['SG-SPR-4', 'SG-HAR-1'],

  publish(state, pack) {
    const harvest = assessHarvest(state, pack)
    const fresh: string[] = []
    if (harvest.ready === true && !harvest.started && !proposedThisSeason(state, READY_KEY)) fresh.push(READY_KEY)
    if (harvest.irrigationCutoff === true && !proposedThisSeason(state, CUTOFF_KEY)) fresh.push(CUTOFF_KEY)
    const extra: Record<string, unknown> = { harvest, harvest_fresh: fresh }
    // Published for the irrigation engine: a pack's irrigation table can stop irrigating on it.
    if (harvest.irrigationCutoff !== null) extra.preharvest_irrigation_cutoff = harvest.irrigationCutoff
    return publishPlan('harvest', seasonPlan('harvest', pack.pack.seasonal?.harvest, state, pack), state, extra, fresh)
  },

  diagnose(state): EngineDiagnosis {
    const h = state.harvest as HarvestState | undefined
    const own = [...(h?.notes ?? [])]
    if (h?.started) own.unshift('Harvest has started')
    else if (h?.ready === true) own.unshift(h.holdDays > 0 ? `Ready, held ${h.holdDays} day(s) by SG-HAR-1` : 'Ready')
    else if (h?.ready === false) own.unshift('Not ready yet')
    return planDiagnosis('harvest', state, own)
  },

  evaluate(blockId, state, pack): ProposedAction[] {
    const h = state.harvest as HarvestState | undefined
    const fresh = Array.isArray(state.harvest_fresh) ? (state.harvest_fresh as string[]) : []
    const actions = planActions('harvest', blockId, state, pack)
    if (!h) return actions
    const common = { engineId: 'harvest' as const, packId: pack.packId, packVersion: pack.packVersion, blockId, evidence: null, flags: stateFlags(state) }

    if (fresh.includes(CUTOFF_KEY)) {
      actions.push(
        proposeAction({
          ...common,
          ruleId: 'HARV-IRRIGATION-CUTOFF',
          actionType: 'stop_irrigation',
          description: `Stop irrigating ahead of the planned harvest on ${String(state.planned_harvest_date)}`,
          earliestDay: 0,
          latestDay: 2,
          inputsSnapshot: { planned_harvest_date: state.planned_harvest_date },
          standing: true,
        }),
      )
    }

    if (fresh.includes(READY_KEY)) {
      const hold: string[] = []
      if (h.phiClearFrom && h.holdDays > 0) hold.push(`a pre-harvest interval runs until ${h.phiClearFrom}`)
      if (h.reentryBlockedUntil) hold.push(`a re-entry interval runs until ${h.reentryBlockedUntil}`)
      const description = [
        'The block is ready to harvest',
        hold.length > 0 ? `Not before day ${h.holdDays} (SG-HAR-1): ${hold.join('; ')}` : null,
        h.unknownSprays > 0 ? `Confirm by hand that no pre-harvest interval is running: ${h.unknownSprays} spray entry(ies) could not be checked` : null,
      ]
        .filter(Boolean)
        .join('. ')
      actions.push(
        proposeAction({
          ...common,
          ruleId: 'HARV-READY',
          actionType: 'harvest',
          description,
          earliestDay: h.holdDays,
          latestDay: h.holdDays + 7,
          inputsSnapshot: { indicators: h.indicators, phi_clear_from: h.phiClearFrom, reentry_blocked_until: h.reentryBlockedUntil, unchecked_spray_entries: h.unknownSprays },
          expectedOutcome: 'The crop is taken off at maturity with no pre-harvest or re-entry interval running',
          requiresEntry: true,
          standing: true,
        }),
      )
    }
    return actions
  },
}
