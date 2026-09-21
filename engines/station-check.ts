/**
 * Weather-station verification (plan §data quality): compares what a farm's own
 * weather station reported with what Open-Meteo modelled for the same place and
 * the same moment, so the manager can see whether the two agree.
 *
 * VERIFICATION ONLY. Nothing here feeds GDD, chill, frost or any recommendation:
 * those keep using Open-Meteo. The check shows whether the modelled weather can
 * be trusted at this site, and exposes a badly placed or miscalibrated station.
 *
 * Compared:
 *  - air temperature, relative humidity and wind speed: the station reading
 *    against the model at that instant (linear between the model's hours);
 *  - rainfall: rain / no rain per day only. Rain is very local, and the station's
 *    rainfall reading is a rate whose interval is not confirmed, so amounts are
 *    not compared.
 * Daily GDD cannot be compared: a station reporting a few times a day has no true
 * daily high and low.
 *
 * Pure: no database, no network, no clock.
 */

export interface StationReading {
  /** ISO timestamp of the reading. */
  at: string
  tempC?: number | null
  humidityPct?: number | null
  windKmh?: number | null
  rainMm?: number | null
}

export interface HourlyModel {
  /** ISO timestamp of the model hour (UTC). */
  at: string
  tempC?: number | null
  humidityPct?: number | null
  windKmh?: number | null
  precipMm?: number | null
}

export type MetricKey = 'temperature' | 'humidity' | 'wind'
export type StationVerdict = 'agree' | 'differs' | 'insufficient'

/**
 * Provisional agreement limits per metric. Open-Meteo is a grid model of about
 * 9 km, so some spread is normal; a persistent larger bias points at station
 * placement or calibration. These are starting values, not calibrated for this
 * site: adjust them once real station data has been seen.
 */
export const METRIC_LIMITS: Record<MetricKey, {
  label: string
  unit: string
  /** Mean station-minus-model difference. */
  maxAbsBias: number
  /** Mean absolute difference. */
  maxMae: number
  /** Readings outside this range are treated as sensor faults and left out. */
  plausible: { min: number; max: number }
  /** What a high or low bias usually means, for the message. */
  highHint: string
  lowHint: string
  extra?: string
}> = {
  temperature: {
    label: 'Air temperature', unit: '°C', maxAbsBias: 1.5, maxMae: 2.5, plausible: { min: -40, max: 60 },
    highHint: 'A warm bias often means the station is in direct sun, on a hot surface, or badly shielded.',
    lowHint: 'A cold bias can mean a cold-air pocket or a low, shaded position.',
  },
  humidity: {
    label: 'Relative humidity', unit: '%', maxAbsBias: 10, maxMae: 15, plausible: { min: 0, max: 100 },
    highHint: 'Higher humidity than the model can mean a damp or shaded spot, or a sensor that drifts high.',
    lowHint: 'Lower humidity than the model can mean a hot, exposed spot (humidity falls as temperature rises) or a sensor that drifts low.',
  },
  wind: {
    label: 'Wind speed', unit: 'km/h', maxAbsBias: 5, maxMae: 8, plausible: { min: 0, max: 200 },
    highHint: 'A station reading windier than the model may be more exposed than the surrounding area.',
    lowHint: 'A station reading calmer than the model is normal if it is mounted lower than 10 m, sheltered, or the model averages the hour while the station reads one instant.',
    extra: 'The model gives the 10 m hourly average, so mounting height and gusts also cause differences.',
  },
}

export const STATION_CHECK_LIMITS = {
  /** Fewest readings, and fewest distinct days, before a numeric verdict is given. */
  minPairs: 12,
  minDays: 3,
  /** Rain: fewest days compared, and fewest days with rain on either side, before a verdict. */
  rain: { minDays: 7, minWetDays: 2, minAgreement: 0.8, wetStationMm: 0.2, wetModelMm: 0.5 },
} as const

export interface MetricCheck {
  key: MetricKey
  label: string
  unit: string
  verdict: StationVerdict
  /** Readings compared. */
  n: number
  days: number
  /** Readings dropped: implausible value, or no model hour on both sides. */
  excluded: { implausible: number; noModel: number }
  bias: number | null
  mae: number | null
  rmse: number | null
  maxAbs: number | null
  /** Plain-language explanation for the reader. */
  message: string
}

export interface RainCheck {
  verdict: StationVerdict
  /** Days with a station reading and a full day of model hours. */
  days: number
  bothWet: number
  bothDry: number
  /** Station saw rain the model did not. */
  stationOnly: number
  /** Model had rain the station did not record. */
  modelOnly: number
  message: string
}

export interface StationReport {
  temperature: MetricCheck
  humidity: MetricCheck
  wind: MetricCheck
  rain: RainCheck
  provisional: true
}

const round1 = (n: number) => Math.round(n * 10) / 10
const HOUR_MS = 3_600_000

/**
 * Model value at an instant, interpolated linearly between the model hour
 * before and the hour after. Null when either hour is missing, so a gap in the
 * model is never filled with a guess.
 */
export function modelValueAt(atMs: number, byHour: Map<number, number>): number | null {
  const lo = Math.floor(atMs / HOUR_MS) * HOUR_MS
  const a = byHour.get(lo)
  if (a === undefined) return null
  if (lo === atMs) return a
  const b = byHour.get(lo + HOUR_MS)
  if (b === undefined) return null
  return a + (b - a) * ((atMs - lo) / HOUR_MS)
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function hourMap(hourly: HourlyModel[], pick: (h: HourlyModel) => number | null | undefined): Map<number, number> {
  const m = new Map<number, number>()
  for (const h of hourly) {
    const v = pick(h)
    const t = Date.parse(h.at)
    if (Number.isFinite(t) && isNum(v)) m.set(t, v)
  }
  return m
}

function checkMetric(
  key: MetricKey,
  readings: { at: string; value: number }[],
  byHour: Map<number, number>,
): MetricCheck {
  const M = METRIC_LIMITS[key]
  const L = STATION_CHECK_LIMITS
  const excluded = { implausible: 0, noModel: 0 }
  const diffs: { at: string; diff: number }[] = []
  for (const r of readings) {
    const t = Date.parse(r.at)
    if (!Number.isFinite(t) || !isNum(r.value)) continue
    if (r.value < M.plausible.min || r.value > M.plausible.max) { excluded.implausible++; continue }
    const model = modelValueAt(t, byHour)
    if (model === null) { excluded.noModel++; continue }
    diffs.push({ at: r.at, diff: r.value - model })
  }

  const days = new Set(diffs.map(d => d.at.slice(0, 10))).size
  const base = { key, label: M.label, unit: M.unit, n: diffs.length, days, excluded }

  if (diffs.length < L.minPairs || days < L.minDays) {
    return {
      ...base, verdict: 'insufficient', bias: null, mae: null, rmse: null, maxAbs: null,
      message: diffs.length === 0
        ? 'No station readings could be matched to the model yet.'
        : `Only ${diffs.length} readings over ${days} day${days === 1 ? '' : 's'} so far: at least ${L.minPairs} readings over ${L.minDays} days are needed.`,
    }
  }

  const n = diffs.length
  const bias = diffs.reduce((s, d) => s + d.diff, 0) / n
  const mae = diffs.reduce((s, d) => s + Math.abs(d.diff), 0) / n
  const rmse = Math.sqrt(diffs.reduce((s, d) => s + d.diff * d.diff, 0) / n)
  const maxAbs = diffs.reduce((m, d) => Math.max(m, Math.abs(d.diff)), 0)
  const biasOk = Math.abs(bias) <= M.maxAbsBias
  const maeOk = mae <= M.maxMae
  const verdict: StationVerdict = biasOk && maeOk ? 'agree' : 'differs'

  let message: string
  if (verdict === 'agree') {
    message = `On average the station reads ${round1(Math.abs(bias))} ${M.unit} ${bias >= 0 ? 'above' : 'below'} the model, and single readings differ by ${round1(mae)} ${M.unit}: they agree.`
  } else {
    const why: string[] = []
    if (!biasOk) why.push(`the station reads ${round1(Math.abs(bias))} ${M.unit} ${bias > 0 ? 'higher' : 'lower'} than the model on average`)
    if (!maeOk) why.push(`single readings differ by ${round1(mae)} ${M.unit} on average`)
    message = `${why.join(' and ')}. ${!biasOk ? (bias > 0 ? M.highHint : M.lowHint) + ' ' : ''}${M.extra ? M.extra + ' ' : ''}The model is a grid average, so a real local difference is also possible.`
  }
  return { ...base, verdict, bias: round1(bias), mae: round1(mae), rmse: round1(rmse), maxAbs: round1(maxAbs), message }
}

function checkRain(readings: StationReading[], hourly: HourlyModel[]): RainCheck {
  const R = STATION_CHECK_LIMITS.rain
  // Model: total per UTC day, only for days with all 24 hours present.
  const modelDay = new Map<string, { sum: number; hours: number }>()
  for (const h of hourly) {
    if (!isNum(h.precipMm)) continue
    const day = h.at.slice(0, 10)
    const d = modelDay.get(day) ?? { sum: 0, hours: 0 }
    d.sum += h.precipMm
    d.hours++
    modelDay.set(day, d)
  }
  // Station: rain seen on the day, over days that have at least one rain reading.
  const stationDay = new Map<string, boolean>()
  for (const r of readings) {
    if (!isNum(r.rainMm) || r.rainMm < 0) continue
    const day = r.at.slice(0, 10)
    stationDay.set(day, (stationDay.get(day) ?? false) || r.rainMm >= R.wetStationMm)
  }

  let bothWet = 0, bothDry = 0, stationOnly = 0, modelOnly = 0
  for (const [day, stationWet] of stationDay) {
    const m = modelDay.get(day)
    if (!m || m.hours < 24) continue
    const modelWet = m.sum >= R.wetModelMm
    if (stationWet && modelWet) bothWet++
    else if (!stationWet && !modelWet) bothDry++
    else if (stationWet) stationOnly++
    else modelOnly++
  }
  const days = bothWet + bothDry + stationOnly + modelOnly
  const wetDays = bothWet + stationOnly + modelOnly
  const base = { days, bothWet, bothDry, stationOnly, modelOnly }

  if (days < R.minDays || wetDays < R.minWetDays) {
    return {
      ...base, verdict: 'insufficient',
      message: days === 0
        ? 'No station rainfall readings could be matched to the model yet.'
        : `Rain can only be judged over at least ${R.minDays} days with rain on at least ${R.minWetDays} of them (${days} day${days === 1 ? '' : 's'} compared, ${wetDays} with rain). A dry spell proves nothing.`,
    }
  }
  const agreement = (bothWet + bothDry) / days
  const verdict: StationVerdict = agreement >= R.minAgreement ? 'agree' : 'differs'
  const message =
    `Rain / no rain agreed on ${bothWet + bothDry} of ${days} days (${Math.round(agreement * 100)}%): ` +
    `${stationOnly} day${stationOnly === 1 ? '' : 's'} the station saw rain the model did not, ${modelOnly} the model had rain the station missed. ` +
    'Rain is very local and a station that reports only a few times a day can miss a shower, so some differences are expected. Amounts are not compared.'
  return { ...base, verdict, message }
}

export function checkStation(readings: StationReading[], hourly: HourlyModel[]): StationReport {
  const series = (pick: (r: StationReading) => number | null | undefined) =>
    readings.flatMap(r => { const v = pick(r); return isNum(v) ? [{ at: r.at, value: v }] : [] })

  return {
    temperature: checkMetric('temperature', series(r => r.tempC), hourMap(hourly, h => h.tempC)),
    humidity: checkMetric('humidity', series(r => r.humidityPct), hourMap(hourly, h => h.humidityPct)),
    wind: checkMetric('wind', series(r => r.windKmh), hourMap(hourly, h => h.windKmh)),
    rain: checkRain(readings, hourly),
    provisional: true,
  }
}
