/**
 * Plant water status readings into the block state (CDSS spec §A4.5). The
 * field form for the pack's indicator (engines/pack/forms.ts) records the
 * reading and the weather the baseline needs; this step takes the latest
 * reading, works out its baseline and deviation with the pack's equation, and
 * publishes them for the decision tables.
 *
 * The values are published under generic keys and, when the pack names them
 * (plant_water_status.state_keys), under the names its tables use.
 */

import { assessWaterStatus } from '../core/water-status'
import type { BlockState } from '../framework/types'
import type { PackContext } from '../pack/context'
import { WATER_STATUS_KIND, WATER_STATUS_READING } from '../pack/forms'
import { MissingValueError } from '../rules/expression'
import type { FieldObservation } from './field-data'
import { daysBetween } from './weather'

export const WATER_STATUS_KEYS = { reading: 'water_status_reading', age_days: 'water_status_age_days', deviation: 'water_status_deviation' } as const

const number = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export interface WaterStatusPublication {
  values: Record<string, unknown>
  flags: string[]
  notes: string[]
}

export function waterStatusValues(pack: PackContext, observations: FieldObservation[], today: string): WaterStatusPublication {
  const model = pack.pack.water?.plant_water_status
  if (!model) return { values: {}, flags: [], notes: [] }
  const latest = observations
    .filter(o => o.kind === WATER_STATUS_KIND && o.observedOn <= today && number(o.values[WATER_STATUS_READING]) !== null)
    .sort((a, b) => a.observedOn.localeCompare(b.observedOn))
    .at(-1)
  if (!latest) return { values: {}, flags: [], notes: [`No ${model.indicator} reading recorded`] }

  const reading = number(latest.values[WATER_STATUS_READING]) as number
  const flags: string[] = []
  const notes: string[] = []
  let deviation: number | null = null
  let baseline: number | null = null
  try {
    const r = assessWaterStatus(reading, { indicator: model.indicator, unit: model.unit, baselineExpression: model.baseline.expression }, latest.values, pack.params)
    deviation = r.deviation
    baseline = r.baseline
    if (r.reducedConfidence) flags.push('WATER_STATUS_NO_BASELINE')
  } catch (e) {
    if (!(e instanceof MissingValueError)) throw e
    // The reading stands; without the baseline's inputs it cannot be compared with a well-watered plant.
    notes.push(`The ${model.indicator} baseline cannot be worked out: ${e.message}`)
  }

  const generic = { reading, age_days: daysBetween(latest.observedOn, today), deviation }
  const values: Record<string, unknown> = { water_status_baseline: baseline, water_status_unit: model.unit, water_status_observed_on: latest.observedOn }
  for (const [k, key] of Object.entries(WATER_STATUS_KEYS) as [keyof typeof WATER_STATUS_KEYS, string][]) {
    values[key] = generic[k]
    const named = model.state_keys?.[k]
    if (named) values[named] = generic[k]
  }
  return { values, flags, notes }
}

/** Adds the reading to the state before the engines run. */
export function withWaterStatus(state: BlockState, pack: PackContext, observations: FieldObservation[], today: string): WaterStatusPublication {
  const p = waterStatusValues(pack, observations, today)
  Object.assign(state, p.values)
  return p
}
