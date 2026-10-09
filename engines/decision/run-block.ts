/**
 * One block, one day: builds the shared block state from weather, soil and
 * records, then runs the decision engines over it (CDSS spec §A5 and §A7).
 *
 * Pure: everything it needs is passed in, and it returns the state, the
 * proposed actions, what each engine concluded, and the water balance to
 * carry to the next day. Engines read each other's results only through the
 * state built here.
 */

import { et0PenmanMonteith } from '../core/et0'
import { kcbFromCover } from '../core/kcb'
import {
  assimilateMeasuredDepletion,
  depletionFromWaterContent,
  MODEL_SENSOR_DIVERGENCE,
  modelSensorDivergence,
  stepWaterBalance,
  totalAvailableWater,
  totalEvaporableWater,
  type WaterBalanceState,
} from '../core/water-balance'
import { engineAvailability } from '../framework/availability'
import type { BlockState, DecisionEngine, EngineDiagnosis, ProposedAction } from '../framework/types'
import type { PackContext } from '../pack/context'
import type { YieldEstimate } from '../core/yield'
import { reentryStatus, type ProductLabel, type SprayApplication } from '../safeguards/spray'
import { diseaseEngine } from './disease'
import { fertigationEngine, type TissueSample } from './fertigation'
import { carriedModels, emptyCarriedModels, storableState, withFieldData, type CarriedModels, type FieldObservation } from './field-data'
import { insectPestEngine } from './insect-pest'
import { frostEngine, type FrostNight } from './frost'
import { irrigationEngine } from './irrigation'
import { phenologyEngine, resolvePhase, type RecordedStage } from './phenology'
import { salinityEngine } from './salinity'
import { canopyPruningEngine, harvestEngine, pollinationEngine, weedGroundcoverEngine } from './seasonal'
import { yieldForecastEngine } from './yield-forecast'
import { addDays, aggregateDaily, dayOfYear, daysBetween, type DailyWeather, type HourlyWeatherPoint } from './weather'

/**
 * The engines built so far, in the order they run. The order follows the
 * couplings (spec §A7): the yield forecast feeds every expected loss and the
 * nutrient budget, salinity sets the leaching fraction irrigation adds,
 * harvest sets the pre-harvest irrigation cut-off, and fertigation places its
 * doses on the irrigations proposed.
 */
export const ENGINES: DecisionEngine[] = [
  phenologyEngine,
  yieldForecastEngine,
  salinityEngine,
  harvestEngine,
  irrigationEngine,
  fertigationEngine,
  frostEngine,
  insectPestEngine,
  diseaseEngine,
  pollinationEngine,
  canopyPruningEngine,
  weedGroundcoverEngine,
]

/** Engines that evaluate every day; the rest plan a season. The arbitrator places the daily ones first. */
export const CONTINUOUS_ENGINE_IDS: string[] = ENGINES.filter(e => e.engineClass === 'continuous').map(e => e.engineId)

export interface CarriedWaterState extends WaterBalanceState {
  /** Last day included in the balance (yyyy-mm-dd). */
  through: string
  /** Crop ET accumulated since the last irrigation, mm. */
  etcSinceIrrigation: number
  /** Measured minus modelled depletion on recent days with a valid reading, mm. */
  gapsMm: number[]
  /** True until rain, irrigation or a reading has replaced the assumed starting depletion. */
  initialAssumed: boolean
  /** Values of the last day computed, kept so a second run on the same day needs no weather. */
  last: { et0: number; etc: number; raw: number; taw: number; ks: number }
}

export interface BlockDayInput {
  /** Farm-local date of the run. */
  today: string
  blockId: string
  pack: PackContext
  /** The pack variety the block is bound to. */
  varietyId: string | null
  recordedStage: RecordedStage | null
  soil: {
    /** Volumetric water content, m3/m3. */
    thetaFC: number | null
    thetaWP: number | null
    rootDepthM: number | null
    /** Depth of the evaporation layer (m) and readily evaporable water (mm). */
    zeM: number
    rewMm: number
    /** True when zeM and rewMm are general defaults, not values for this soil. */
    evaporationDefaults: boolean
  }
  canopy: { cover: number | null; heightM: number | null }
  /** Fraction of the surface the irrigation system wets. */
  wettedFraction: number | null
  areaHa: number | null
  site: { latitudeDeg: number; elevationM: number | null }
  settings: {
    irrigationEfficiency: number
    /** Forecast error allowance for frost, degC. */
    frostMarginC: number
    /** Farm switches named by the pack, such as a deficit strategy. */
    switches: Record<string, boolean>
  }
  weather: HourlyWeatherPoint[]
  /** True when the weather is modelled for the location, not measured on the farm. */
  weatherModelled: boolean
  /** Gross irrigation applied per local date, mm. */
  irrigationMmByDate: Record<string, number>
  /** Latest validated soil water content (m3/m3) and when it was read. */
  measuredTheta: { value: number; at: string } | null
  carried: CarriedWaterState | null
  /** Whole years since planting; null when the planting year is not known. */
  ageYears: number | null
  yield: {
    /** The manager's estimate for this block this season, in the pack's yield unit per hectare. */
    blockEstimate: number | null
    /** The farm's target for a mature block. */
    matureTarget: number | null
    /** Price per yield unit, in the farm's currency. */
    pricePerUnit: number | null
    observations?: YieldEstimate[]
    /** Observed damage fractions this season. */
    damageFractions?: number[]
  }
  /** Latest laboratory values, in dS/m, with their dates. */
  lab: { soilEce: { value: number; at: string } | null; waterEc: { value: number; at: string } | null }
  nutrition: {
    /** Nutrient applied this season in kg/ha by nutrient; null when entries exist whose nutrient content is not known. */
    applied: Record<string, number> | null
    tissue: TissueSample | null
  }
  /** Field records for the pest and disease engines; all optional. */
  field?: {
    observations?: FieldObservation[]
    products?: ProductLabel[]
    /** Spray applications in the block this season. */
    applications?: SprayApplication[]
    /** Dated phenology events by name. */
    events?: Record<string, string>
    plannedHarvestDate?: string | null
    carriedModels?: CarriedModels | null
  }
  /** The time of the run, for intervals counted in hours; defaults to noon of `today`. */
  nowIso?: string
}

export interface EngineResult {
  active: boolean
  /** Why the engine is inactive for this crop. */
  reason: string | null
  diagnosis: EngineDiagnosis | null
  actions: number
}

export interface BlockDayResult {
  state: BlockState
  carried: CarriedWaterState | null
  engines: Record<string, EngineResult>
  actions: ProposedAction[]
  /** Biofix dates, degree-days and infection values to carry to the next day. */
  carriedModels: CarriedModels
}

/** Recent gaps kept for the divergence check. */
const GAP_HISTORY_DAYS = 14
/** The model and the sensors diverge when they differ by this share of TAW for this many days running. */
const DIVERGENCE_TAW_SHARE = 0.1
const DIVERGENCE_MIN_DAYS = 3
const FROST_HORIZON_DAYS = 3

type Kcb = { value: number } | { missing: string[] }

/** The basal crop coefficient for a block in a phase, by the pack's declared method. */
export function resolveKcb(
  pack: PackContext,
  phase: string | null,
  canopy: { cover: number | null; heightM: number | null },
  climate: { wind2m: number; rhMin: number },
): Kcb {
  const kcb = pack.pack.water?.kcb
  if (!kcb) return { missing: ['a crop coefficient in the pack'] }
  const missing: string[] = []
  const param = (ref: string): number | null => {
    const v = pack.params[ref.slice(1)]
    if (typeof v !== 'number') missing.push(`${ref} (to be sourced)`)
    return typeof v === 'number' ? v : null
  }

  if (kcb.method === 'curve') {
    if (phase === null) return { missing: ['the growth phase'] }
    const entry = kcb.curve?.find(c => c.phase === phase)
    if (!entry) return { missing: [`a crop coefficient for the ${phase} phase`] }
    const value = param(entry.kcb)
    return value === null ? { missing } : { value }
  }

  if (canopy.cover === null) missing.push('canopy cover of the block')
  if (canopy.heightM === null) missing.push('canopy height of the block')
  if (!kcb.params) return { missing: [...missing, 'the density-coefficient parameters in the pack'] }
  const ml = param(kcb.params.ml)
  const fr = param(kcb.params.fr)
  const kcMin = param(kcb.params.kc_min)
  if (missing.length > 0 || ml === null || fr === null || kcMin === null || canopy.cover === null || canopy.heightM === null) {
    return { missing }
  }
  return { value: kcbFromCover({ fcEff: canopy.cover, heightM: canopy.heightM, ml, fr, kcMin, wind2m: climate.wind2m, rhMin: climate.rhMin }) }
}

interface WaterOutcome {
  carried: CarriedWaterState | null
  missing: string[]
  flags: string[]
  daysAdvanced: number
}

function advanceWater(input: BlockDayInput, phase: string | null, days: DailyWeather[]): WaterOutcome {
  const { soil, pack, canopy } = input
  const missing: string[] = []
  const flags: string[] = []

  const rootDepthRef = pack.pack.water?.root_depth_m
  const packRootDepth = rootDepthRef ? pack.params[rootDepthRef.slice(1)] : null
  const rootDepthM = soil.rootDepthM ?? (typeof packRootDepth === 'number' ? packRootDepth : null)
  const pRef = pack.pack.water?.depletion_fraction
  const pBase = pRef ? pack.params[pRef.slice(1)] : null

  if (soil.thetaFC === null || soil.thetaWP === null) missing.push('field capacity and wilting point of the block')
  else if (soil.thetaFC <= soil.thetaWP) missing.push('a field capacity above the wilting point')
  if (rootDepthM === null) missing.push('root depth of the block')
  if (typeof pBase !== 'number') missing.push('the depletion fraction in the pack')
  if (input.site.elevationM === null) missing.push('elevation of the farm')
  if (canopy.cover === null) missing.push('canopy cover of the block')
  if (canopy.heightM === null) missing.push('canopy height of the block')

  const probe = resolveKcb(pack, phase, canopy, { wind2m: 2, rhMin: 45 })
  if ('missing' in probe) for (const m of probe.missing) if (!missing.includes(m)) missing.push(m)

  if (
    missing.length > 0 ||
    soil.thetaFC === null ||
    soil.thetaWP === null ||
    rootDepthM === null ||
    typeof pBase !== 'number' ||
    input.site.elevationM === null ||
    canopy.cover === null ||
    canopy.heightM === null
  ) {
    return { carried: null, missing, flags, daysAdvanced: 0 }
  }

  const balanceSoil = { thetaFC: soil.thetaFC, thetaWP: soil.thetaWP, zeM: soil.zeM, rewMm: soil.rewMm, pBase }
  const taw = totalAvailableWater(soil.thetaFC, soil.thetaWP, rootDepthM)
  const past = days.filter(d => d.complete && !d.forecast && d.date < input.today)

  let carried = input.carried
  let todo = carried ? past.filter(d => d.date > carried!.through) : past
  // A hole between the carried balance and the weather on hand: the balance cannot be continued, so it starts again.
  if (carried && todo.length > 0 && todo[0].date !== addDays(carried.through, 1)) carried = null
  if (!carried) {
    todo = past
    if (todo.length === 0) return { carried: null, missing: ['a complete day of weather'], flags, daysAdvanced: 0 }
    carried = {
      through: addDays(todo[0].date, -1),
      Dr: 0,
      De: totalEvaporableWater(balanceSoil),
      fw: input.wettedFraction ?? 1,
      etcSinceIrrigation: 0,
      gapsMm: [],
      initialAssumed: true,
      last: { et0: 0, etc: 0, raw: pBase * taw, taw, ks: 1 },
    }
  }

  let next: CarriedWaterState = { ...carried, gapsMm: [...carried.gapsMm] }
  for (const d of todo) {
    const kcb = resolveKcb(pack, phase, canopy, { wind2m: d.wind2m, rhMin: d.rhmin })
    if ('missing' in kcb) return { carried: null, missing: kcb.missing, flags, daysAdvanced: 0 }
    const et0 = et0PenmanMonteith({
      tmax: d.tmax,
      tmin: d.tmin,
      rhmax: d.rhmax,
      rhmin: d.rhmin,
      wind2m: d.wind2m,
      rs: d.rsMj,
      elevationM: input.site.elevationM,
      latitudeDeg: input.site.latitudeDeg,
      dayOfYear: dayOfYear(d.date),
    })
    const irrigation = input.irrigationMmByDate[d.date] ?? 0
    const r = stepWaterBalance(
      next,
      {
        et0,
        rain: d.rainMm,
        irrigation,
        efficiency: input.settings.irrigationEfficiency,
        fwIrrigation: irrigation > 0 ? input.wettedFraction ?? 1 : null,
        kcb: kcb.value,
        heightM: canopy.heightM,
        fc: Math.min(canopy.cover, 0.99),
        rootDepthM,
        wind2m: d.wind2m,
        rhMin: d.rhmin,
      },
      balanceSoil,
    )
    next = {
      ...r.state,
      through: d.date,
      etcSinceIrrigation: irrigation > 0 ? 0 : next.etcSinceIrrigation + r.etc,
      gapsMm: next.gapsMm,
      // Water draining below the roots means the profile refilled, whatever it held at the start.
      initialAssumed: next.initialAssumed && r.deepPercolation === 0,
      last: { et0, etc: r.etc, raw: r.raw, taw: r.taw, ks: r.ks },
    }
  }

  // Sensor fusion: a validated reading taken since the last balanced day replaces the modelled depletion.
  // Skipped on a second run of the same day, so one reading is not counted twice.
  const m = input.measuredTheta
  if (m && todo.length > 0 && m.at.slice(0, 10) >= next.through) {
    const measured = depletionFromWaterContent(m.value, soil.thetaFC, soil.thetaWP, rootDepthM)
    const a = assimilateMeasuredDepletion(next.Dr, measured, taw)
    next = { ...next, Dr: a.Dr, initialAssumed: false, gapsMm: [...next.gapsMm, a.gapMm].slice(-GAP_HISTORY_DAYS) }
    if (modelSensorDivergence(next.gapsMm, DIVERGENCE_TAW_SHARE * taw, DIVERGENCE_MIN_DAYS)) flags.push(MODEL_SENSOR_DIVERGENCE)
  }

  if (next.initialAssumed) flags.push('INITIAL_DEPLETION_ASSUMED')
  if (soil.evaporationDefaults) flags.push('SOIL_EVAPORATION_DEFAULTS')
  if (input.wettedFraction === null) flags.push('WETTED_FRACTION_ASSUMED')
  return { carried: next, missing: [], flags, daysAdvanced: todo.length }
}

/** The coldest forecast temperature of each of the next nights. */
export function frostNights(hours: HourlyWeatherPoint[], today: string): FrostNight[] {
  const byDate = new Map<string, number>()
  for (const h of hours) {
    if (!h.forecast || h.tempC === null) continue
    const dayIndex = daysBetween(today, h.localDate)
    if (dayIndex < 0 || dayIndex > FROST_HORIZON_DAYS) continue
    byDate.set(h.localDate, Math.min(byDate.get(h.localDate) ?? Infinity, h.tempC))
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, minC]) => ({ date, dayIndex: daysBetween(today, date), minC }))
}

export function runBlockDay(input: BlockDayInput): BlockDayResult {
  const { pack, today } = input
  const flags: string[] = []
  if (input.weatherModelled) flags.push('WEATHER_MODELLED')

  // Phenology publishes the phase first: every other engine reads it.
  const resolved = resolvePhase(pack.pack, input.recordedStage)
  if (resolved.phase !== null) flags.push('PHASE_FROM_RECORDED_STAGE')

  const days = aggregateDaily(input.weather)
  const water = advanceWater(input, resolved.phase, days)
  flags.push(...water.flags)

  const state: BlockState = {
    date: today,
    phase: resolved.phase,
    recorded_stage: input.recordedStage?.stage ?? null,
    recorded_stage_at: input.recordedStage?.recordedAt ?? null,
    variety: input.varietyId,
    area_ha: input.areaHa,
    efficiency: input.settings.irrigationEfficiency,
    // The salinity engine sets the leaching fraction; until it runs, none is added.
    leaching_fraction: 0,
    frost_nights: frostNights(input.weather, today),
    frost_warning_margin_c: input.settings.frostMarginC,
    frost_watch_margin_c: 2 * input.settings.frostMarginC,
    water_balance_missing: water.missing,
    water_balance_days_advanced: water.daysAdvanced,
    age_years: input.ageYears,
    canopy_cover: input.canopy.cover,
    canopy_height_m: input.canopy.heightM,
    yield_block_estimate: input.yield.blockEstimate,
    yield_mature_target: input.yield.matureTarget,
    price_per_yield_unit: input.yield.pricePerUnit,
    yield_observations: input.yield.observations ?? [],
    yield_damage_fractions: input.yield.damageFractions ?? [],
    soil_ece: input.lab.soilEce?.value ?? null,
    soil_ece_at: input.lab.soilEce?.at ?? null,
    water_ec: input.lab.waterEc?.value ?? null,
    water_ec_at: input.lab.waterEc?.at ?? null,
    nutrients_applied: input.nutrition.applied,
    tissue_sample: input.nutrition.tissue,
  }
  flags.push('LEACHING_NOT_ASSESSED')

  const applications = input.field?.applications ?? []
  const products = input.field?.products ?? []
  withFieldData(state, {
    daily: days,
    hours: input.weather,
    observations: input.field?.observations ?? [],
    products,
    applications,
    events: input.field?.events ?? {},
    carriedModels: input.field?.carriedModels ?? emptyCarriedModels(),
  })
  state.planned_harvest_date = input.field?.plannedHarvestDate ?? null
  // SG-SPR-5: labour stays out of the block until the re-entry interval of the last spray has passed.
  const reentry = reentryStatus(applications, products, new Date(input.nowIso ?? `${today}T12:00:00Z`))
  state.reentry_blocked_until = reentry.blockedUntil
  state.reentry_unknown_applications = reentry.unknown

  for (const strategy of pack.pack.water?.deficit_strategies ?? []) {
    state[strategy.switch] = input.settings.switches[strategy.switch] ?? false
  }

  if (water.carried) {
    const c = water.carried
    Object.assign(state, {
      Dr: c.Dr,
      De: c.De,
      RAW: c.last.raw,
      TAW: c.last.taw,
      Ks: c.last.ks,
      ET0: c.last.et0,
      ETc: c.last.etc,
      ETc_since_last: c.etcSinceIrrigation,
      water_balance_through: c.through,
    })
  }

  // Rain expected today and tomorrow, and the highest chance of it.
  const ahead = days.filter(d => d.date >= today && d.date <= addDays(today, 1))
  if (ahead.length > 0) {
    state.rain_48h_mm = ahead.reduce((s, d) => s + d.rainMm, 0)
    const probs = ahead.map(d => d.rainProb).filter((p): p is number => p !== null)
    if (probs.length > 0) state.rain_prob = Math.max(...probs)
  }

  state.flags = [...new Set(flags)]

  const engines: Record<string, EngineResult> = {}
  const actions: ProposedAction[] = []
  const now = new Date(`${today}T00:00:00Z`)
  for (const engine of ENGINES) {
    const availability = engineAvailability(engine, pack.pack)
    if (!availability.active) {
      engines[engine.engineId] = { active: false, reason: availability.reason, diagnosis: null, actions: 0 }
      continue
    }
    if (engine.publish) {
      const published = engine.publish(state, pack)
      Object.assign(state, published.values)
      const kept = (state.flags as string[]).filter(f => !(published.removeFlags ?? []).includes(f))
      state.flags = [...new Set([...kept, ...(published.addFlags ?? [])])]
    }
    const proposed = engine.evaluate(input.blockId, state, pack, now)
    actions.push(...proposed)
    // Engines after this one can see what it proposed (irrigation events for fertigation, for example).
    state[`${engine.engineId}_actions`] = proposed.map(a => ({
      actionId: a.actionId,
      actionType: a.actionType,
      quantity: a.quantity,
      unit: a.unit,
      earliestDay: a.earliestDay,
      latestDay: a.latestDay,
    }))
    engines[engine.engineId] = {
      active: true,
      reason: null,
      diagnosis: engine.diagnose ? engine.diagnose(state, pack) : null,
      actions: proposed.length,
    }
  }

  return { state: storableState(state), carried: water.carried, engines, actions, carriedModels: carriedModels(state) }
}
