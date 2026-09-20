/**
 * Daily agronomic snapshot (plan §6): one block's raw readings and forecast run
 * through the quality layer and the engines, with every value carrying its unit,
 * source, time and state. Pure: the cron route does the loading and saving.
 */
import { dayOfYear, hargreavesETo } from '@/utils/agronomic'
import { makeStatefulValue, type StatefulValue } from '@/utils/value-state'
import { toEngineStages } from '@/utils/stage-map'
import { checkSeries, SOIL_MOISTURE_RULES, usableReadings, type RawReading, type SensorHealth } from './quality'
import { evaluateIrrigation, FULL_IRRIGATION, type IrrigationResult } from './irrigation'
import { evaluateFrostRisk, type FrostRiskResult } from './weather-risk'

export const SNAPSHOT_VERSION = 1

export interface SnapshotPolicy {
  strategyName: string
  allowableDepletion: number
  efficiency: number
  frostMarginC: number
  sensorFailedAfterHours: number
  defaultRootDepthM: number | null
  wellLicenceVolumeM3: number | null
}

export interface ForecastDay {
  date: string // YYYY-MM-DD
  tMax: number
  tMin: number
  rain: number
}

export interface SnapshotBlock {
  id: string
  variety: string | null
  fieldCapacityPct: number | null
  wiltingPointPct: number | null
  rootDepthM: number | null
  areaHa: number | null
  hasSensor: boolean
}

export interface SnapshotInput {
  date: string
  now: Date
  latDeg: number
  block: SnapshotBlock
  /** phenology_records.current_stage, and where it came from. */
  dbStage: string | null
  stageSource: 'computed' | 'manual' | null
  /** Soil-moisture sensor readings, percent volumetric, recent first or last. */
  moistureReadings: RawReading[]
  forecast: ForecastDay[]
  /** When the forecast was fetched (ISO), so a stale forecast is not mistaken for a calm one. */
  forecastFetchedAt: string | null
  policy: SnapshotPolicy
}

export interface DailySnapshot {
  version: number
  date: string
  blockId: string
  variety: string | null
  phenology: {
    stage: StatefulValue<string>
    notes: string[]
  }
  water: {
    moisture: StatefulValue
    sensor: { health: SensorHealth | 'none'; reasons: string[]; excluded: boolean }
    etoToday: StatefulValue
    irrigation: IrrigationResult
  }
  weather: {
    forecastDays: number
    /** Hours since the forecast was fetched; null when there is no forecast. */
    forecastAgeHours: number | null
    frost: FrostRiskResult
  }
}

export function defaultPolicy(): SnapshotPolicy {
  return {
    strategyName: FULL_IRRIGATION.name,
    allowableDepletion: FULL_IRRIGATION.allowableDepletion,
    efficiency: 0.9,
    frostMarginC: 2,
    sensorFailedAfterHours: 24,
    defaultRootDepthM: null,
    wellLicenceVolumeM3: null,
  }
}

function forecastAgeHours(fetchedAt: string | null, now: Date): number | null {
  if (!fetchedAt) return null
  const t = Date.parse(fetchedAt)
  return Number.isNaN(t) ? null : Math.round(((now.getTime() - t) / 3_600_000) * 10) / 10
}

const doyOf = (date: string) => dayOfYear(new Date(`${date}T12:00:00`))

export function buildSnapshot(input: SnapshotInput): DailySnapshot {
  const { block, policy, now } = input
  const stages = toEngineStages(input.dbStage)

  // ── Sensor quality ────────────────────────────────────────────────────────
  const quality = checkSeries(input.moistureReadings, { ...SOIL_MOISTURE_RULES, failedAfterHours: policy.sensorFailedAfterHours }, now)
  const hasReadings = input.moistureReadings.length > 0
  const health: SensorHealth | 'none' = hasReadings || block.hasSensor ? quality.health : 'none'
  // A failed sensor, or one stuck on one value, is excluded from calculations
  // (plan §8). An implausible jump alone is not: irrigation and rain move soil
  // moisture fast, and excluding the sensor right after irrigating would blind
  // the engine exactly when it matters. It stays visible as 'suspect'.
  const stuck = quality.readings.some(r => r.flag === 'stuck')
  const excluded = quality.health === 'failed' || stuck
  const usable = usableReadings(quality)
  const last = excluded ? undefined : usable[usable.length - 1]

  const moisture = makeStatefulValue({
    value: last?.value ?? null,
    unit: '% VWC',
    source: 'sensor',
    observedAt: last?.at ?? null,
    kind: 'soil_moisture',
    now,
  })

  // ── Forecast → ETo (Hargreaves, estimated) ───────────────────────────────
  const days = [...input.forecast].sort((a, b) => a.date.localeCompare(b.date)).filter(d => d.date >= input.date)
  const withEto = days.map(d => ({
    date: d.date,
    eto: hargreavesETo(d.tMax, d.tMin, input.latDeg, doyOf(d.date)),
    rain: d.rain ?? 0,
  }))
  const etoToday = makeStatefulValue({
    value: withEto[0]?.eto ?? null,
    unit: 'mm/day',
    source: 'computed',
    observedAt: withEto[0] ? now.toISOString() : null,
    kind: 'eto',
    now,
  })

  // ── Engines ───────────────────────────────────────────────────────────────
  const irrigation = evaluateIrrigation({
    fieldCapacityPct: block.fieldCapacityPct,
    wiltingPointPct: block.wiltingPointPct,
    rootDepthM: block.rootDepthM ?? policy.defaultRootDepthM,
    moisture,
    stage: stages.irrigation,
    etoToday: withEto[0]?.eto ?? null,
    forecast: withEto.map(d => ({ eto: d.eto, rain: d.rain })),
    strategy: { name: policy.strategyName, allowableDepletion: policy.allowableDepletion },
    efficiency: policy.efficiency,
    areaHa: block.areaHa,
    remainingAllocationM3: null, // season usage is not tracked yet, so the remaining volume is unknown
    canopyCoverKnown: false,
  })

  const frost = evaluateFrostRisk(
    stages.frost,
    days.map(d => ({ date: d.date, tMin: d.tMin })),
    { variety: block.variety, marginC: policy.frostMarginC },
  )

  const stage: StatefulValue<string> = {
    value: input.dbStage,
    unit: '',
    source: input.stageSource === 'manual' ? 'manual' : 'computed',
    observedAt: input.dbStage ? now.toISOString() : null,
    // The stage comes from GDD thresholds unless a person confirmed it.
    state: input.dbStage == null ? 'UNKNOWN' : input.stageSource === 'manual' ? 'KNOWN' : 'ESTIMATED',
  }

  return {
    version: SNAPSHOT_VERSION,
    date: input.date,
    blockId: block.id,
    variety: block.variety,
    phenology: { stage, notes: stages.notes },
    water: {
      moisture,
      sensor: { health, reasons: quality.reasons, excluded },
      etoToday,
      irrigation,
    },
    weather: {
      forecastDays: days.length,
      forecastAgeHours: forecastAgeHours(input.forecastFetchedAt, now),
      frost,
    },
  }
}
