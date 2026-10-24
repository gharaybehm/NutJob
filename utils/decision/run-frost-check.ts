/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Supabase admin client, tables postdate the generated types */
/**
 * The frost check every two hours (engines/decision/frost-check.ts): for each
 * block bound to a Crop Knowledge Pack whose frost engine is active in its
 * current phase, a fresh forecast and the farm's latest station reading are
 * run through the frost engine. The block's phase, variety and margins come
 * from the state the daily run stored.
 *
 * Every check is recorded in frost_checks and every recommendation in the
 * append-only log. Only when the farm has switched the frost engine to Live
 * does a night at warning or critical open an alert and send a push; in
 * Shadow nothing reaches the alerts, the Recommendations page or the
 * calendar. The arbitrator's plan is not remade: the next daily run picks the
 * night up.
 */
import { frostAlertChanges, FROST_ALERT_RULE, runFrostCheck, withStationReading } from '@/engines/decision/frost-check'
import { frostNights } from '@/engines/decision/run-block'
import { overridesFor } from '@/engines/learning/calibration'
import { createPackContext, type PackContext } from '@/engines/pack/context'
import { packSchema, type Pack } from '@/engines/pack/schema'
import { validateProbe, type ProbeLimits } from '@/engines/safeguards/sensor'
import { probeWindowS, staleAfterS, typicalIntervalS } from '@/engines/sensor-interval'
import { nightLevels } from './calendar-layer'
import { loadCalibrationStates } from './calibrations'
import { fetchHourlyWeather } from './hourly-weather'

export interface FrostCheckFarmResult {
  farm: string
  /** Blocks whose frost engine assessed them (active in their phase). */
  assessed: number
  /** Blocks at watch, warning or critical. */
  atRisk: number
  /** Whether a validated station reading was used. */
  station: 'used' | 'warmer_than_forecast' | 'none' | 'invalid'
  logged: number
  alertsCreated: number
  alertsResolved: number
  errors: string[]
}

export interface FrostCheckOptions {
  now?: Date
  dryRun?: boolean
  farmId?: string
}

const FORECAST_DAYS = 4
/** A stored state older than this is too old to take the block's phase from. */
const STATE_MAX_AGE_DAYS = 2
const STATION_ROWS_MAX = 500

/**
 * Plausibility limits for an air-temperature probe. The range is the SenseCAP
 * S2120 station's measuring range (-40 to 85 degC), capped at 60 degC as no
 * orchard air reading above it is real. The step is per hour between
 * readings: air temperature does not move 10 degC within an hour outside a
 * front, and a reading that does is held back rather than acted on.
 */
const AIR_TEMP = { min: -40, max: 60, maxStepPerHour: 10 }

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** The latest validated reading of each station, each judged on its own reading interval. */
function validStationReadings(rows: { sensor_id: string; recorded_at: string; temp_c: unknown }[], now: Date): { reading: { tempC: number; at: string } | null; invalid: boolean } {
  const bySensor = new Map<string, { at: Date; value: number }[]>()
  for (const r of rows) {
    const value = num(r.temp_c)
    if (value === null) continue
    bySensor.set(r.sensor_id, [...(bySensor.get(r.sensor_id) ?? []), { at: new Date(r.recorded_at), value }])
  }
  let coldest: { tempC: number; at: string } | null = null
  let invalid = false
  for (const series of bySensor.values()) {
    series.sort((a, b) => a.at.getTime() - b.at.getTime())
    const interval = typicalIntervalS(series.map(s => s.at))
    if (interval === null) continue
    const since = now.getTime() - probeWindowS(interval) * 1000
    const window = series.filter(s => s.at.getTime() >= since)
    const limits: ProbeLimits = {
      maxAgeS: staleAfterS(interval),
      minPlausible: AIR_TEMP.min,
      maxPlausible: AIR_TEMP.max,
      maxStep: AIR_TEMP.maxStepPerHour * Math.max(1, interval / 3600),
    }
    if (!validateProbe(window, now, limits).valid) {
      invalid = true
      continue
    }
    const latest = window[window.length - 1]
    if (coldest === null || latest.value < coldest.tempC) coldest = { tempC: latest.value, at: latest.at.toISOString() }
  }
  return { reading: coldest, invalid: coldest === null && invalid }
}

export async function runFrostCheckAll(admin: any, opts: FrostCheckOptions = {}): Promise<FrostCheckFarmResult[]> {
  const now = opts.now ?? new Date()
  const results: FrostCheckFarmResult[] = []
  const packCache = new Map<string, Pack | string>()

  /** The block's pack with the farm's calibrated values in force, as in the daily run. */
  async function loadPack(packId: string, version: string, overrides: Record<string, number>): Promise<PackContext | string> {
    const key = `${packId}@${version}`
    let loaded = packCache.get(key)
    if (!loaded) {
      const { data, error } = await admin.from('crop_packs').select('content').eq('pack_id', packId).eq('version', version).maybeSingle()
      if (error) loaded = `Pack ${key} could not be loaded: ${error.message}`
      else if (!data) loaded = `Pack ${key} is not installed`
      else {
        const parsed = packSchema.safeParse(data.content)
        loaded = parsed.success ? parsed.data : `Pack ${key} does not match the pack format of this platform version`
      }
      packCache.set(key, loaded)
    }
    return typeof loaded === 'string' ? loaded : createPackContext(loaded, overrides)
  }

  let farmQuery = admin.from('farms').select('id, name, gps_lat, gps_lng')
  if (opts.farmId) farmQuery = farmQuery.eq('id', opts.farmId)
  const { data: farms, error: farmsError } = await farmQuery
  if (farmsError) throw new Error(`Could not load farms: ${farmsError.message}`)

  for (const farm of farms ?? []) {
    const { data: blocks } = await admin.from('blocks').select('id, name, crop_type, variety, pack_id, pack_version, pack_variety_id').eq('farm_id', farm.id)
    const bound: any[] = (blocks ?? []).filter((b: any) => b.pack_id && b.pack_version)
    if (bound.length === 0) continue
    const r: FrostCheckFarmResult = { farm: farm.name, assessed: 0, atRisk: 0, station: 'none', logged: 0, alertsCreated: 0, alertsResolved: 0, errors: [] }
    results.push(r)

    const lat = num(farm.gps_lat)
    const lng = num(farm.gps_lng)
    if (lat === null || lng === null) {
      r.errors.push('Farm has no GPS position, so the forecast cannot be fetched')
      continue
    }
    const weather = await fetchHourlyWeather(lat, lng, 1, FORECAST_DAYS, now)
    if (!weather || weather.rows.length === 0) {
      r.errors.push('Hourly weather could not be fetched')
      continue
    }
    const today = weather.localToday
    const forecastNights = frostNights(weather.rows, today)

    // The farm's stations: the latest validated air temperature, judged on each station's own interval.
    const { data: sensors } = await admin.from('sensors').select('id').eq('farm_id', farm.id)
    const sensorIds: string[] = (sensors ?? []).map((s: any) => s.id)
    let station: { tempC: number; at: string; localDate: string } | null = null
    if (sensorIds.length > 0) {
      const since = new Date(now.getTime() - 48 * 3_600_000).toISOString()
      const { data: rows } = await admin
        .from('weather_snapshots')
        .select('sensor_id, recorded_at, temp_c')
        .in('sensor_id', sensorIds)
        .eq('source', 'sensor')
        .gte('recorded_at', since)
        .not('temp_c', 'is', null)
        .order('recorded_at', { ascending: false })
        .limit(STATION_ROWS_MAX)
      const v = validStationReadings(rows ?? [], now)
      if (v.reading) {
        const localDate = new Date(Date.parse(v.reading.at) + weather.utcOffsetMinutes * 60_000).toISOString().slice(0, 10)
        station = { ...v.reading, localDate }
      } else if (v.invalid) r.station = 'invalid'
    }
    const nights = withStationReading(forecastNights, today, station)
    if (station) r.station = nights.some(n => n.station) ? 'used' : 'warmer_than_forecast'

    const blockIds = bound.map(b => b.id)
    const { data: stateRows } = await admin
      .from('block_engine_state')
      .select('block_id, state_date, state')
      .in('block_id', blockIds)
      .order('state_date', { ascending: false })
      .limit(blockIds.length * 3)
    const stateByBlock = new Map<string, { date: string; state: Record<string, unknown> }>()
    for (const s of stateRows ?? []) if (!stateByBlock.has(s.block_id)) stateByBlock.set(s.block_id, { date: String(s.state_date).slice(0, 10), state: s.state ?? {} })

    const { data: modeRows } = await admin.from('farm_engine_modes').select('pack_id, mode').eq('farm_id', farm.id).eq('engine_id', 'frost')
    const livePacks = new Set<string>((modeRows ?? []).filter((m: any) => m.mode === 'live').map((m: any) => m.pack_id))

    const { data: openRows } = await admin
      .from('block_alerts')
      .select('id, block_id, dedup_key')
      .in('block_id', blockIds)
      .eq('rule_id', FROST_ALERT_RULE)
      .eq('resolved', false)

    const calibration = await loadCalibrationStates(admin, farm.id)
    if (calibration.error) r.errors.push(`Calibrated values could not be read, so the pack values are used: ${calibration.error}`)

    for (const b of bound) {
      try {
        const stored = stateByBlock.get(b.id)
        if (!stored) {
          r.errors.push(`Block ${b.id}: no stored state yet; the daily run has not reached it`)
          continue
        }
        const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${stored.date}T00:00:00Z`)) / 86_400_000
        if (age > STATE_MAX_AGE_DAYS) {
          r.errors.push(`Block ${b.id}: the latest stored state is from ${stored.date}, too old to take the growth phase from`)
          continue
        }
        const pack = await loadPack(b.pack_id, b.pack_version, overridesFor(calibration.states, b.pack_id, b.id, b.pack_variety_id ?? null))
        if (typeof pack === 'string') {
          r.errors.push(`Block ${b.id}: ${pack}`)
          continue
        }

        const check = runFrostCheck(b.id, stored.state, nights, pack, now)
        // Out of its phases the engine has nothing to say; nothing is recorded.
        if (check.inactiveReason) continue
        r.assessed++
        if (check.level !== 'none') r.atRisk++
        const live = livePacks.has(pack.packId)
        if (opts.dryRun) continue

        const { error: checkError } = await admin.from('frost_checks').insert({
          farm_id: farm.id,
          block_id: b.id,
          checked_at: now.toISOString(),
          local_date: today,
          mode: live ? 'live' : 'shadow',
          pack_id: pack.packId,
          pack_version: pack.packVersion,
          level: check.level,
          worst_night: check.worstNight?.date ?? null,
          worst_min_c: check.worstNight?.minC ?? null,
          nights,
          night_levels: nightLevels(check.actions),
          station,
          notes: check.notes,
        })
        if (checkError) r.errors.push(`Block ${b.id}: check not saved: ${checkError.message}`)

        if (check.actions.length > 0) {
          const rows = check.actions.map(a => ({
            farm_id: farm.id,
            block_id: b.id,
            run_date: today,
            mode: live ? 'live' : 'shadow',
            engine_id: a.engineId,
            rule_id: a.ruleId,
            pack_id: a.packId,
            pack_version: a.packVersion,
            crop: b.crop_type ?? null,
            variety: b.variety ?? null,
            action_type: a.actionType,
            target_date: new Date(Date.parse(`${today}T00:00:00Z`) + a.earliestDay * 86_400_000).toISOString().slice(0, 10),
            action: a,
            inputs: a.inputsSnapshot,
            calibrated_params: Object.fromEntries(pack.calibrated.map(id => [id, pack.params[id]])),
            flags: a.flags,
            confidence: a.confidence,
            mandatory: a.mandatory,
            expected_outcome: a.expectedOutcome,
          }))
          // The same recommendation from an earlier check today is already in the log.
          const { data: written, error: logError } = await admin
            .from('engine_recommendation_log')
            .upsert(rows, { onConflict: 'block_id,run_date,engine_id,rule_id,action_type,target_date', ignoreDuplicates: true })
            .select('id')
          if (logError) r.errors.push(`Block ${b.id}: recommendations not logged: ${logError.message}`)
          else r.logged += written?.length ?? 0
        }

        if (!live) continue
        const open = (openRows ?? []).filter((o: any) => o.block_id === b.id).map((o: any) => ({ id: o.id as string, dedupKey: (o.dedup_key ?? null) as string | null }))
        const changes = frostAlertChanges(check.actions, open, today)
        if (changes.resolve.length > 0) {
          const { error } = await admin.from('block_alerts').update({ resolved: true, resolved_at: now.toISOString() }).in('id', changes.resolve).eq('rule_id', FROST_ALERT_RULE)
          if (error) r.errors.push(`Block ${b.id}: could not close frost alerts: ${error.message}`)
          else r.alertsResolved += changes.resolve.length
        }
        for (const c of changes.create) {
          const { error } = await admin.from('block_alerts').insert({
            block_id: b.id,
            domain: 'weather',
            severity: c.severity,
            message: c.message,
            source: 'computed',
            rule_id: FROST_ALERT_RULE,
            dedup_key: c.dedupKey,
            details: c.details,
          })
          // 23505: a check running at the same time already opened it.
          if (error && error.code !== '23505') {
            r.errors.push(`Block ${b.id}: frost alert not saved: ${error.message}`)
            continue
          }
          if (error) continue
          r.alertsCreated++
          const { sendPushToFarm } = await import('@/utils/push')
          await sendPushToFarm(farm.id, {
            title: c.severity === 'critical' ? `Frost: protect ${b.name} on ${c.night}` : `Frost warning: ${b.name}, ${c.night}`,
            body: c.message,
            url: `/${farm.id}/dashboard`,
            tag: `${FROST_ALERT_RULE}:${b.id}:${c.night}`,
          }).catch((e: unknown) => r.errors.push(`Block ${b.id}: push failed: ${e instanceof Error ? e.message : String(e)}`))
        }
      } catch (e) {
        r.errors.push(`Block ${b.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }
  return results
}
