/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Supabase admin client, tables predate the generated types */
/**
 * Daily snapshot job: for every farm, loads each block's data, builds the
 * snapshot, stores it, and reconciles the watchdog alerts. Loading and saving
 * only: all the decisions live in the pure modules under engines/.
 */
import { buildSnapshot, defaultPolicy, type DailySnapshot, type ForecastDay, type SnapshotPolicy } from '@/engines/snapshot'
import { alertsFromSnapshot, reconcileAlerts, WATCHDOG_RULE_IDS, type OpenAlert } from '@/engines/watchdog'
import { toHectares } from '@/utils/area'

export interface FarmRunResult {
  farm: string
  blocks: number
  snapshots: number
  alertsCreated: number
  alertsResolved: number
  errors: string[]
}

export interface RunOptions {
  now?: Date
  /** Compute everything but write nothing. */
  dryRun?: boolean
  farmId?: string
  /** Receives every snapshot built, so a dry run can be inspected. */
  collect?: DailySnapshot[]
}

const MOISTURE_WINDOW_HOURS = 72
const MOISTURE_MAX_ROWS = 500

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toPolicy(row: any | null): SnapshotPolicy {
  const d = defaultPolicy()
  if (!row) return d
  return {
    strategyName: row.irrigation_strategy_name ?? d.strategyName,
    allowableDepletion: num(row.allowable_depletion) ?? d.allowableDepletion,
    efficiency: num(row.irrigation_efficiency) ?? d.efficiency,
    frostMarginC: num(row.frost_margin_c) ?? d.frostMarginC,
    sensorFailedAfterHours: num(row.sensor_failed_after_hours) ?? d.sensorFailedAfterHours,
    defaultRootDepthM: num(row.default_root_depth_m),
    wellLicenceVolumeM3: num(row.well_licence_volume_m3),
  }
}

function toForecast(json: any): ForecastDay[] {
  const days: any[] = Array.isArray(json?.days) ? json.days : []
  return days.flatMap((d) => {
    const tMax = num(d.temp_max)
    const tMin = num(d.temp_min)
    return typeof d.date === 'string' && tMax !== null && tMin !== null
      ? [{ date: d.date, tMax, tMin, rain: num(d.precipitation_mm) ?? 0 }]
      : []
  })
}

export async function runDailySnapshot(admin: any, opts: RunOptions = {}): Promise<FarmRunResult[]> {
  const now = opts.now ?? new Date()
  const date = now.toISOString().slice(0, 10)
  const results: FarmRunResult[] = []

  let farmQuery = admin.from('farms').select('id, name, gps_lat')
  if (opts.farmId) farmQuery = farmQuery.eq('id', opts.farmId)
  const { data: farms, error: farmsError } = await farmQuery
  if (farmsError) throw new Error(`Could not load farms: ${farmsError.message}`)

  for (const farm of farms ?? []) {
    const r: FarmRunResult = { farm: farm.name, blocks: 0, snapshots: 0, alertsCreated: 0, alertsResolved: 0, errors: [] }
    results.push(r)

    if (farm.gps_lat === null || farm.gps_lat === undefined) {
      r.errors.push('Farm has no GPS latitude, so ETo cannot be computed')
      continue
    }

    const { data: policyRow } = await admin.from('farm_policy').select('*').eq('farm_id', farm.id).maybeSingle()
    const policy = toPolicy(policyRow)

    const { data: blocks, error: blocksError } = await admin
      .from('blocks')
      .select('id, crop_type, variety, rootstock, field_capacity, wilting_point, root_depth_m, area, area_unit, planting_date, planting_year')
      .eq('farm_id', farm.id)
    if (blocksError) {
      r.errors.push(`Could not load blocks: ${blocksError.message}`)
      continue
    }
    r.blocks = blocks?.length ?? 0
    if (r.blocks === 0) continue
    const blockIds: string[] = blocks.map((b: any) => b.id)

    const { data: phenology } = await admin
      .from('phenology_latest')
      .select('block_id, current_stage, source')
      .in('block_id', blockIds)
    const stageByBlock = new Map<string, { stage: string; source: string }>(
      (phenology ?? []).map((p: any) => [p.block_id, { stage: p.current_stage, source: p.source }]),
    )

    const { data: sensors } = await admin.from('sensors').select('block_id').eq('farm_id', farm.id)
    const sensorBlocks = new Set<string>((sensors ?? []).map((s: any) => s.block_id).filter(Boolean))

    const { data: wx } = await admin
      .from('weather_snapshots')
      .select('forecast_json, recorded_at')
      .eq('farm_id', farm.id)
      .is('block_id', null)
      .order('recorded_at', { ascending: false })
      .limit(1)
    const forecast = toForecast(wx?.[0]?.forecast_json)
    const forecastFetchedAt: string | null = wx?.[0]?.recorded_at ?? null

    const { data: openRows } = await admin
      .from('block_alerts')
      .select('id, block_id, rule_id, dedup_key')
      .in('block_id', blockIds)
      .eq('resolved', false)
    const openByBlock = new Map<string, OpenAlert[]>()
    for (const o of openRows ?? []) {
      const list = openByBlock.get(o.block_id) ?? []
      list.push({ id: o.id, ruleId: o.rule_id ?? null, dedupKey: o.dedup_key ?? null })
      openByBlock.set(o.block_id, list)
    }

    const since = new Date(now.getTime() - MOISTURE_WINDOW_HOURS * 3_600_000).toISOString()

    for (const b of blocks) {
      try {
        const { data: soil } = await admin
          .from('soil_water_readings')
          .select('recorded_at, soil_moisture')
          .eq('block_id', b.id)
          .eq('source', 'sensor')
          .not('soil_moisture', 'is', null)
          .gte('recorded_at', since)
          .order('recorded_at', { ascending: false })
          .limit(MOISTURE_MAX_ROWS)
        const moistureReadings = (soil ?? [])
          .map((s: any) => ({ at: s.recorded_at as string, value: num(s.soil_moisture) }))
          .filter((s: { value: number | null }): s is { at: string; value: number } => s.value !== null)
          .reverse()

        const stage = stageByBlock.get(b.id)
        const hasSensor = sensorBlocks.has(b.id)
        const snapshot = buildSnapshot({
          date,
          now,
          latDeg: Number(farm.gps_lat),
          block: {
            id: b.id,
            cropType: b.crop_type ?? null,
            variety: b.variety ?? null,
            rootstock: b.rootstock ?? null,
            fieldCapacityPct: num(b.field_capacity),
            wiltingPointPct: num(b.wilting_point),
            rootDepthM: num(b.root_depth_m),
            areaHa: toHectares(b.area, b.area_unit),
            hasSensor,
            plantingDate: b.planting_date ?? null,
            plantingYear: num(b.planting_year),
          },
          dbStage: stage?.stage ?? null,
          stageSource: stage ? (stage.source === 'manual' ? 'manual' : 'computed') : null,
          moistureReadings,
          forecast,
          forecastFetchedAt,
          policy,
        })

        opts.collect?.push(snapshot)
        const candidates = alertsFromSnapshot(snapshot, hasSensor)
        const { create, resolve } = reconcileAlerts(candidates, openByBlock.get(b.id) ?? [])

        if (opts.dryRun) {
          r.snapshots++
          r.alertsCreated += create.length
          r.alertsResolved += resolve.length
          continue
        }

        const { error: snapError } = await admin.from('daily_snapshots').upsert(
          { farm_id: farm.id, block_id: b.id, snapshot_date: date, version: snapshot.version, data: snapshot },
          { onConflict: 'block_id,snapshot_date' },
        )
        if (snapError) {
          r.errors.push(`Block ${b.id}: snapshot not saved: ${snapError.message}`)
          continue
        }
        r.snapshots++

        for (const c of create) {
          const { error } = await admin.from('block_alerts').insert({
            block_id: b.id,
            domain: c.domain,
            severity: c.severity,
            message: c.message,
            source: 'computed',
            rule_id: c.ruleId,
            dedup_key: c.dedupKey,
            details: c.details,
          })
          // 23505: another run already opened this exact event, which is the point of the dedup key.
          if (error && error.code !== '23505') r.errors.push(`Block ${b.id}: alert ${c.ruleId} not saved: ${error.message}`)
          else if (!error) r.alertsCreated++
        }

        if (resolve.length > 0) {
          const { error } = await admin
            .from('block_alerts')
            .update({ resolved: true, resolved_at: now.toISOString() })
            .in('id', resolve)
            .in('rule_id', WATCHDOG_RULE_IDS)
          if (error) r.errors.push(`Block ${b.id}: could not resolve cleared alerts: ${error.message}`)
          else r.alertsResolved += resolve.length
        }
      } catch (e) {
        r.errors.push(`Block ${b.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  return results
}
