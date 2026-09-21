/**
 * Daily watchdog rules (plan §25): turns a snapshot into alert candidates.
 * Rule-based and deterministic. It never depends on the LLM, and it only
 * advises: a candidate is a message for the manager, not an action.
 *
 * To avoid alert fatigue only warning and critical conditions raise an alert,
 * and each event has a stable dedup key so it raises one alert, not one per run.
 */
import type { DailySnapshot } from './snapshot'

export type AlertRuleId = 'frost' | 'sensor_failed' | 'irrigate_now' | 'forecast_stale'
export const WATCHDOG_RULE_IDS: AlertRuleId[] = ['frost', 'sensor_failed', 'irrigate_now', 'forecast_stale']

/** A forecast older than this is not trusted for frost. The weather job runs every 3 hours. */
export const FORECAST_MAX_AGE_HOURS = 12

export interface AlertCandidate {
  ruleId: AlertRuleId
  /** Stable per event within a block, e.g. `frost:2026-04-12`. */
  dedupKey: string
  domain: 'weather' | 'soil-water'
  severity: 'warning' | 'critical'
  message: string
  details: Record<string, unknown>
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function alertsFromSnapshot(s: DailySnapshot, blockHasSensor: boolean): AlertCandidate[] {
  const out: AlertCandidate[] = []

  // ── Frost ────────────────────────────────────────────────────────────────
  const frost = s.weather.frost
  if (frost.applicable && frost.worstDay && (frost.level === 'warning' || frost.level === 'critical')) {
    const d = frost.worstDay
    const th = frost.threshold!
    const measured = th.basis === 'variety_tested'
      ? `measured for ${s.variety}`
      : 'not measured for this variety, so a general almond value is used'
    out.push({
      ruleId: 'frost',
      dedupKey: `frost:${d.date}`,
      domain: 'weather',
      severity: frost.level,
      message:
        `Frost ${frost.level === 'critical' ? 'expected' : 'possible'} on ${d.date}: forecast minimum ${round1(d.tMin)} °C ` +
        `(could be ${round1(d.tMinLow)} to ${round1(d.tMinHigh)} °C). Damage starts near ${th.lt10} °C at this stage (${measured}). ` +
        `Check the block and your frost protection.` +
        (s.maturity.class === 'non_bearing'
          ? ` This block is not bearing yet (${s.maturity.label.toLowerCase()}), so little or no crop is at risk, but young trees can still be damaged.`
          : ''),
      details: {
        date: d.date,
        forecastMinC: d.tMin,
        rangeC: [d.tMinLow, d.tMinHigh],
        band: d.band,
        lt10: th.lt10,
        lt50: th.lt50,
        lt90: th.lt90,
        basis: th.basis,
        source: th.source,
        caveat: th.caveat,
        stage: s.phenology.stage.value,
        variety: s.variety,
        maturity: s.maturity.class,
      },
    })
  }

  // ── Missing or stale forecast while frost matters ─────────────────────────
  // Without this, a weather outage during bloom would read as "no frost".
  const w = s.weather
  if (frost.applicable && (w.forecastDays === 0 || w.forecastAgeHours === null || w.forecastAgeHours > FORECAST_MAX_AGE_HOURS)) {
    out.push({
      ruleId: 'forecast_stale',
      dedupKey: 'forecast_stale',
      domain: 'weather',
      severity: 'warning',
      message:
        w.forecastDays === 0
          ? 'No weather forecast is available, so frost risk cannot be assessed while the trees are frost-sensitive. Check the weather feed and watch the forecast yourself.'
          : `The weather forecast is ${w.forecastAgeHours === null ? 'of unknown age' : `${Math.round(w.forecastAgeHours)} hours old`}, so frost risk may be out of date while the trees are frost-sensitive. Check the weather feed.`,
      details: { forecastDays: w.forecastDays, forecastAgeHours: w.forecastAgeHours },
    })
  }

  // ── Sensor failure (only for blocks that have a sensor) ───────────────────
  if (blockHasSensor && s.water.sensor.health === 'failed') {
    out.push({
      ruleId: 'sensor_failed',
      dedupKey: 'sensor_failed',
      domain: 'soil-water',
      severity: 'warning',
      message:
        `Soil moisture sensor problem: ${s.water.sensor.reasons.join('; ') || 'no usable readings'}. ` +
        `Its readings are left out of irrigation advice until it recovers. Check the sensor and logger.`,
      details: { reasons: s.water.sensor.reasons },
    })
  }

  // ── Irrigation limit reached ──────────────────────────────────────────────
  const irr = s.water.irrigation
  if (irr.status === 'irrigate_now' && irr.depletionMm !== null && irr.rawMm !== null) {
    const volume = irr.requirementM3 !== null ? ` (${round1(irr.requirementM3)} m³ for the block)` : ''
    out.push({
      ruleId: 'irrigate_now',
      dedupKey: 'irrigate_now',
      domain: 'soil-water',
      severity: 'warning',
      message:
        `Soil water depletion (${irr.depletionMm} mm) has reached the allowable limit (${irr.rawMm} mm) under the ${irr.strategy} strategy. ` +
        `Consider irrigating about ${irr.requirementMm} mm${volume}. Confidence: ${irr.confidence}.`,
      details: {
        depletionMm: irr.depletionMm,
        rawMm: irr.rawMm,
        requirementMm: irr.requirementMm,
        requirementM3: irr.requirementM3,
        strategy: irr.strategy,
        confidence: irr.confidence,
        dataGaps: irr.dataGaps,
      },
    })
  }

  return out
}

export interface OpenAlert {
  id: string
  ruleId: string | null
  dedupKey: string | null
}

/**
 * Compares the candidates with the block's open alerts. `create` are new events;
 * `resolve` are open alerts from watchdog rules whose condition has cleared.
 * Alerts from other sources (sensors, manual) are never touched.
 */
export function reconcileAlerts(
  candidates: AlertCandidate[],
  open: OpenAlert[],
): { create: AlertCandidate[]; resolve: string[] } {
  const openKeys = new Set(open.map(o => o.dedupKey).filter((k): k is string => k !== null))
  const wanted = new Set(candidates.map(c => c.dedupKey))
  const create = candidates.filter(c => !openKeys.has(c.dedupKey))
  const resolve = open
    .filter(o => o.ruleId !== null && (WATCHDOG_RULE_IDS as string[]).includes(o.ruleId))
    .filter(o => o.dedupKey === null || !wanted.has(o.dedupKey))
    .map(o => o.id)
  return { create, resolve }
}
