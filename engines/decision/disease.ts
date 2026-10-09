/**
 * Disease engine (CDSS spec §A6.7): one engine, any number of disease
 * models, of three types the pack can declare.
 *
 *   infection_value   leaf wetness x temperature, accumulated over a rolling
 *                     window and compared with the pack's action threshold
 *   phenology_timed   a preventive programme at set times after a dated
 *                     phenology event
 *   cultural_risk     a risk driven by other engines' state at a sensitive
 *                     phase, published as an advisory
 *
 * A treatment proposal carries the farm's products for that disease with
 * their spray-safeguard and resistance-rotation findings.
 */

import { accumulatedInfection, infectionValueForDay, type HourlyWetness } from '../core/infection'
import { convertTemperature } from '../core/units'
import { breaksRotation } from '../safeguards/spray'
import type { PackContext } from '../pack/context'
import type { Pack } from '../pack/schema'
import type { BlockState, DecisionEngine, EngineDiagnosis, EnginePublication, ProposedAction } from '../framework/types'
import { proposeAction, stateFlags } from './action'
import { carriedModels, carriedModelsValue, fieldData, sprayOptions, type DiseaseCarried, type FieldData } from './field-data'
import { addDays, daysBetween } from './weather'

type DiseaseModel = NonNullable<Pack['diseases']>['diseases'][number]
type InfectionModelDef = Extract<DiseaseModel, { type: 'infection_value' }>
type TimedModelDef = Extract<DiseaseModel, { type: 'phenology_timed' }>

export interface DiseaseState {
  type: DiseaseModel['type']
  active: boolean
  /** infection_value: the accumulated value and its threshold. */
  accumulated?: number | null
  threshold?: number | null
  /** phenology_timed: the anchor date and the treatment windows in days from today. */
  anchorDate?: string | null
  windows?: { label: string; earliestDay: number; latestDay: number; done: boolean }[]
  /** cultural_risk: the advisory and the driver values on hand. */
  advisory?: string | null
  drivers?: Record<string, unknown>
  ruleId: string | null
  notes: string[]
}

const number = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const DAILY_VALUES_KEPT = 60

function assessInfection(d: InfectionModelDef, state: BlockState, pack: PackContext, data: FieldData, carried: DiseaseCarried | undefined): { s: DiseaseState; carried: DiseaseCarried } {
  const today = String(state.date)
  const notes: string[] = []
  const keep: DiseaseCarried = { dailyValues: [...(carried?.dailyValues ?? [])], lastRule: carried?.lastRule ?? null }
  const threshold = number(pack.params[d.threshold.slice(1)])
  const phase = typeof state.phase === 'string' ? state.phase : null
  const inWindow = d.active_phases === null || (phase !== null && d.active_phases.includes(phase))
  if (!inWindow) return { s: { type: d.type, active: false, accumulated: null, threshold, ruleId: null, notes: [`Not assessed in the ${phase ?? 'unknown'} phase`] }, carried: keep }

  // The day's value is computed at the model's evaluation hour over the hours before it.
  const ordered = [...data.hours].filter(h => !h.forecast).sort((a, b) => (a.localDate === b.localDate ? a.localHour - b.localHour : a.localDate.localeCompare(b.localDate)))
  if (!ordered.some(h => h.leafWet !== null && h.leafWet !== undefined)) {
    notes.push('Needs hourly leaf wetness, which no data source provides yet')
    return { s: { type: d.type, active: false, accumulated: null, threshold, ruleId: null, notes }, carried: keep }
  }
  const have = new Set(keep.dailyValues.map(v => v.date))
  ordered.forEach((h, i) => {
    if (h.localHour !== d.evaluation.hour || have.has(h.localDate) || i < d.evaluation.window_hours) return
    const window = ordered.slice(i - d.evaluation.window_hours, i)
    if (window.some(w => w.leafWet === null || w.leafWet === undefined || w.tempC === null)) return
    const hourly: HourlyWetness[] = window.map(w => ({ temp: convertTemperature(w.tempC as number, 'C', d.units), wet: w.leafWet as boolean }))
    keep.dailyValues.push({ date: h.localDate, value: infectionValueForDay(hourly, { bands: d.bands, dryHoursSplit: d.dry_hours_split, aggregate: d.aggregate }) })
  })
  keep.dailyValues = keep.dailyValues.sort((a, b) => a.date.localeCompare(b.date)).slice(-DAILY_VALUES_KEPT)

  const resets = d.reset_on_spray ? data.applications.filter(a => a.targetId === d.id).map(a => a.date) : []
  const accumulated = accumulatedInfection(keep.dailyValues, today, d.accumulation_days, resets)
  if (threshold === null) notes.push(`${d.threshold} is still to be sourced`)
  const ruleId = threshold !== null && accumulated >= threshold ? `${d.id}:THRESHOLD` : null
  return { s: { type: d.type, active: true, accumulated, threshold, ruleId, notes }, carried: keep }
}

/** How many days ahead a treatment window is proposed. */
const PROPOSE_AHEAD_DAYS = 7

function assessTimed(d: TimedModelDef, state: BlockState, data: FieldData): DiseaseState {
  const today = String(state.date)
  const season = today.slice(0, 4)
  const anchorDate = data.events[d.anchor_event] ?? null
  if (anchorDate === null || anchorDate.slice(0, 4) !== season) {
    return { type: d.type, active: false, anchorDate: null, windows: [], ruleId: null, notes: [`No ${d.anchor_event} date recorded this season`] }
  }
  const applied = data.applications.filter(a => a.targetId === d.id).map(a => a.date)
  const windows = d.timings.map(t => {
    const from = addDays(anchorDate, t.offset_days[0])
    const to = addDays(anchorDate, t.offset_days[1])
    return {
      label: t.label,
      earliestDay: daysBetween(today, from),
      latestDay: daysBetween(today, to),
      // A treatment against the disease from three days before the window to its end counts for it.
      done: applied.some(a => a >= addDays(from, -3) && a <= to),
    }
  })
  const due = windows.find(w => !w.done && w.latestDay >= 0 && w.earliestDay <= PROPOSE_AHEAD_DAYS)
  const missed = windows.filter(w => !w.done && w.latestDay < 0).map(w => w.label)
  return {
    type: d.type,
    active: true,
    anchorDate,
    windows,
    ruleId: due ? `${d.id}:TIMING` : null,
    notes: missed.length > 0 ? [`Passed without a recorded treatment: ${missed.join('; ')}`] : [],
  }
}

function assess(state: BlockState, pack: PackContext): { diseases: Record<string, DiseaseState>; carried: Record<string, DiseaseCarried> } {
  const data = fieldData(state)
  const carried = carriedModels(state)
  const diseases: Record<string, DiseaseState> = {}
  const next: Record<string, DiseaseCarried> = { ...carried.diseases }
  const phase = typeof state.phase === 'string' ? state.phase : null

  for (const d of pack.pack.diseases?.diseases ?? []) {
    if (d.type === 'infection_value') {
      const r = assessInfection(d, state, pack, data, carried.diseases[d.id])
      diseases[d.id] = r.s
      next[d.id] = r.carried
    } else if (d.type === 'phenology_timed') {
      diseases[d.id] = assessTimed(d, state, data)
    } else {
      const active = phase === d.phase
      diseases[d.id] = {
        type: d.type,
        active,
        advisory: active ? d.drivers.map(x => x.effect).join(' ') : null,
        drivers: active ? Object.fromEntries(d.drivers.map(x => [x.state_key, state[x.state_key] ?? null])) : {},
        ruleId: active ? `${d.id}:ADVISORY` : null,
        notes: active ? [] : [`Applies in the ${d.phase} phase`],
      }
    }
  }
  return { diseases, carried: next }
}

export const diseaseEngine: DecisionEngine = {
  engineId: 'disease',
  engineClass: 'continuous',
  packRequirements: () => ['diseases.diseases'],
  requiredState: () => ['date', 'phase'],
  safeguards: () => ['SG-SPR-1', 'SG-SPR-2', 'SG-SPR-3', 'SG-SPR-4', 'SG-SPR-5', 'SG-SPR-6', 'SG-SPR-7'],

  publish(state, pack): EnginePublication {
    const { diseases, carried } = assess(state, pack)
    // Cultural advice goes to the other engines as state, not as an action of its own.
    const advisories = Object.entries(diseases).flatMap(([id, d]) => (d.advisory ? [{ disease: id, text: d.advisory, drivers: d.drivers }] : []))
    return { values: { diseases, disease_advisories: advisories, ...carriedModelsValue({ ...carriedModels(state), diseases: carried }) } }
  },

  diagnose(state): EngineDiagnosis {
    const diseases = (state.diseases ?? {}) as Record<string, DiseaseState>
    const notes = Object.entries(diseases).map(([id, d]) => {
      const detail =
        d.type === 'infection_value' && d.active
          ? `accumulated ${d.accumulated} against a threshold of ${d.threshold ?? 'unknown'}`
          : d.type === 'phenology_timed' && d.active
            ? `anchor ${d.anchorDate}`
            : d.advisory ?? 'not active'
      return `${id}: ${detail}${d.notes.length ? `. ${d.notes.join('. ')}` : ''}`
    })
    return { ruleId: null, outcome: Object.keys(diseases).length > 0 ? 'assessed' : null, skipped: [], notes }
  },

  evaluate(blockId, state, pack): ProposedAction[] {
    const diseases = (state.diseases ?? {}) as Record<string, DiseaseState>
    const data = fieldData(state)
    const flags = stateFlags(state)
    const actions: ProposedAction[] = []

    for (const model of pack.pack.diseases?.diseases ?? []) {
      const d = diseases[model.id]
      if (!d || d.ruleId === null || model.type === 'cultural_risk') continue

      // Resistance management: a product whose group has just been used the maximum number of times in a row is excluded.
      const maxRef = model.type === 'phenology_timed' ? model.resistance?.max_consecutive_same_group : undefined
      const maxConsecutive = maxRef ? number(pack.params[maxRef.slice(1)]) : null
      const options = sprayOptions(state, pack, model.id, label =>
        maxConsecutive !== null && breaksRotation(label, model.id, data.applications, data.products, maxConsecutive)
          ? { safeguardId: 'RESISTANCE', reason: `Its mode-of-action group was used on the last ${maxConsecutive} treatment(s) against this disease` }
          : null,
      )
      const rotationNote = maxRef && maxConsecutive === null ? `Rotation of mode-of-action groups is not checked: ${maxRef} is still to be sourced` : null

      const window = d.windows?.find(w => !w.done && w.latestDay >= 0 && w.earliestDay <= PROPOSE_AHEAD_DAYS)
      const earliest = window ? Math.max(0, window.earliestDay) : 0
      const latest = window ? window.latestDay : 3
      const open = options.openDays.filter(day => day >= earliest && day <= latest)
      const why = window ? `${window.label} (from the ${String(d.anchorDate)} anchor date)` : `accumulated value ${d.accumulated} has reached the threshold ${d.threshold}`

      actions.push(
        proposeAction({
          engineId: 'disease',
          ruleId: d.ruleId,
          packId: pack.packId,
          packVersion: pack.packVersion,
          blockId,
          actionType: `spray_${model.id}`,
          description: [`${model.name}: treat. ${why}`, options.note, rotationNote].filter(Boolean).join('. '),
          quantity: 1,
          unit: 'spray application',
          earliestDay: open[0] ?? earliest,
          latestDay: open[open.length - 1] ?? latest,
          inputsSnapshot: { disease: model.id, model_type: model.type, phase: state.phase, accumulated: d.accumulated ?? null, threshold: d.threshold ?? null, anchor_date: d.anchorDate ?? null, window: window ?? null, spray_safeguards: options },
          evidence: model.evidence,
          expectedOutcome: 'No new symptoms of the disease at the next scouting',
          flags,
        }),
      )
    }
    return actions
  },
}
