/**
 * Field records the pest and disease engines read: observations entered in
 * the field (trap checks, scouting, hull split, hives), the farm's product
 * library, spray applications, and the model state carried from day to day
 * (biofix dates, accumulated degree-days, daily infection values).
 *
 * These travel in the block state under one key that is not stored with the
 * state: the records stay where they are and only what the engines conclude
 * from them is kept.
 */

import { checkProduct, type ProductCheck, type ProductLabel, type SprayApplication } from '../safeguards/spray'
import type { BlockState } from '../framework/types'
import type { PackContext } from '../pack/context'
import type { DailyWeather, HourlyWeatherPoint } from './weather'

export interface FieldObservation {
  /** The kind of observation, as the pack names it (for example a trap check). */
  kind: string
  /** The pack id of the pest or disease it concerns; null for a block-level observation. */
  subject: string | null
  /** Farm-local date. */
  observedOn: string
  values: Record<string, unknown>
}

export interface PestCarried {
  /** The year the biofix belongs to; a new year starts again. */
  season: number
  biofix: string | null
  biofixSource: 'rule' | 'observed' | null
  /** Degree-days accumulated since biofix, in the model's units, through `through`. */
  dd: number
  through: string | null
  /** The rule that decided the last run, so a standing task is proposed once, not daily. */
  lastRule: string | null
}

export interface DiseaseCarried {
  dailyValues: { date: string; value: number }[]
  lastRule: string | null
}

export interface CarriedModels {
  pests: Record<string, PestCarried>
  diseases: Record<string, DiseaseCarried>
}

export interface FieldData {
  daily: DailyWeather[]
  hours: HourlyWeatherPoint[]
  observations: FieldObservation[]
  products: ProductLabel[]
  applications: SprayApplication[]
  /** Dated phenology events by name, for example a petal-fall date. */
  events: Record<string, string>
  carriedModels: CarriedModels
}

/** State keys starting with this are working data and are not stored. */
export const TRANSIENT_PREFIX = '_'
const DATA_KEY = '_field_data'
const CARRIED_KEY = '_carried_models'

export const emptyCarriedModels = (): CarriedModels => ({ pests: {}, diseases: {} })

export function withFieldData(state: BlockState, data: FieldData): void {
  state[DATA_KEY] = data
  state[CARRIED_KEY] = data.carriedModels
}

export function fieldData(state: BlockState): FieldData {
  const data = state[DATA_KEY] as FieldData | undefined
  return data ?? { daily: [], hours: [], observations: [], products: [], applications: [], events: {}, carriedModels: emptyCarriedModels() }
}

export function carriedModels(state: BlockState): CarriedModels {
  return (state[CARRIED_KEY] as CarriedModels | undefined) ?? emptyCarriedModels()
}

/** The publication that replaces the carried model state. */
export const carriedModelsValue = (next: CarriedModels) => ({ [CARRIED_KEY]: next })

/** A copy of the state without the working data, for storage. */
export function storableState(state: BlockState): BlockState {
  return Object.fromEntries(Object.entries(state).filter(([key]) => !key.startsWith(TRANSIENT_PREFIX)))
}

const number = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Observations of one kind for a subject (or block-level ones), oldest first, this season only. */
export function observationsOf(all: FieldObservation[], kind: string, subject: string, season: number): FieldObservation[] {
  return all
    .filter(o => o.kind === kind && (o.subject === subject || o.subject === null) && Number(o.observedOn.slice(0, 4)) === season)
    .sort((a, b) => a.observedOn.localeCompare(b.observedOn))
}

export interface Derivation {
  key: string
  stat: 'latest' | 'rising_run' | 'latest_ratio'
  observation: string
  field: string
  over?: string
}

export interface DerivedValue {
  value: number | null
  /** Date of the newest observation used. */
  latestDate: string | null
  /** For a rising run: the date of the first check that rose. */
  runStartDate: string | null
}

/** One state value computed from a series of observations, as the pack declares it. */
export function derive(d: Derivation, series: FieldObservation[]): DerivedValue {
  const points = series.flatMap(o => {
    const value = number(o.values[d.field])
    return value === null ? [] : [{ date: o.observedOn, value, obs: o }]
  })
  if (points.length === 0) return { value: null, latestDate: null, runStartDate: null }
  const latest = points[points.length - 1]

  if (d.stat === 'latest') return { value: latest.value, latestDate: latest.date, runStartDate: null }

  if (d.stat === 'latest_ratio') {
    const over = d.over ? number(latest.obs.values[d.over]) : null
    return { value: over === null || over === 0 ? null : latest.value / over, latestDate: latest.date, runStartDate: null }
  }

  let run = 0
  let runStartDate: string | null = null
  for (let i = points.length - 1; i > 0 && points[i].value > points[i - 1].value; i--) {
    run++
    runStartDate = points[i].date
  }
  return { value: run, latestDate: latest.date, runStartDate }
}

/** Hours of the day in which a sprayer can work; a farm setting once the farm-setup screens exist. */
const WORKING_HOURS: [number, number] = [6, 19]
const SPRAY_HORIZON_DAYS = 4

export interface SprayOptions {
  /** Every library product listed against the target, with its safeguard findings. */
  products: ProductCheck[]
  /** Days from today on which at least one product may be used. */
  openDays: number[]
  note: string | null
}

/** Checks the farm's products for a target against the spray safeguards. */
export function sprayOptions(state: BlockState, pack: PackContext, targetId: string, alsoBlocked?: (label: ProductLabel) => { safeguardId: string; reason: string } | null): SprayOptions {
  const data = fieldData(state)
  const candidates = data.products.filter(p => p.targets.includes(targetId))
  if (candidates.length === 0) {
    return { products: [], openDays: [], note: 'The product library has no product listed against this target' }
  }
  const hives = [...data.observations].filter(o => o.kind === 'hives').sort((a, b) => a.observedOn.localeCompare(b.observedOn)).pop()
  const hivesPresent = typeof hives?.values.present === 'boolean' ? hives.values.present : null
  const phase = typeof state.phase === 'string' ? state.phase : null
  const beePhases = pack.pack.seasonal?.pollination?.bee_protection_phases ?? []

  const products = candidates.map(label => {
    const check = checkProduct(label, {
      today: String(state.date),
      hours: data.hours,
      horizonDays: SPRAY_HORIZON_DAYS,
      workingHours: WORKING_HOURS,
      plannedHarvestDate: typeof state.planned_harvest_date === 'string' ? state.planned_harvest_date : null,
      applications: data.applications,
      hivesPresent,
      inBeePhase: phase !== null && beePhases.includes(phase),
    })
    const extra = alsoBlocked?.(label) ?? null
    return extra ? { ...check, blocked: [...check.blocked, extra], usable: false } : check
  })
  const openDays = [...new Set(products.filter(p => p.usable).flatMap(p => p.days.filter(d => d.allowedHours.length > 0).map(d => d.dayIndex)))].sort((a, b) => a - b)
  return { products, openDays, note: openDays.length === 0 ? 'No listed product passes the spray safeguards on any day ahead' : null }
}
