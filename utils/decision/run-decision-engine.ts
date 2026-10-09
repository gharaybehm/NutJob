/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Supabase admin client, tables postdate the generated types */
/**
 * Decision engine, daily shadow run: for every block bound to a Crop
 * Knowledge Pack, loads its data, builds the block state, runs the engines,
 * and stores the state and the recommendations. Loading and saving only: the
 * decisions live in the pure modules under engines/decision/.
 *
 * Everything is logged in shadow mode. Nothing here reaches the
 * Recommendations page, the alerts, or the calendar; the live daily snapshot
 * (utils/run-daily-snapshot.ts) runs beside it, unchanged.
 */
import { buildPlan, HORIZON_DAYS, type FarmLimits, type FarmPlan } from '@/engines/arbitrator/plan'
import type { CarriedModels, FieldObservation } from '@/engines/decision/field-data'
import { CONTINUOUS_ENGINE_IDS, runBlockDay, type BlockDayResult, type CarriedWaterState } from '@/engines/decision/run-block'
import type { ProposedAction } from '@/engines/framework/types'
import { buildNarratorInput, type NarrationLanguage } from '@/engines/narrator/narration'
import type { ProductLabel, SprayApplication } from '@/engines/safeguards/spray'
import { daysBetween } from '@/engines/decision/weather'
import { createPackContext, type PackContext } from '@/engines/pack/context'
import { packSchema } from '@/engines/pack/schema'
import { checkSeries, SOIL_MOISTURE_RULES, usableReadings } from '@/engines/quality'
import { toHectares } from '@/utils/area'
import { toPolicy } from '@/utils/run-daily-snapshot'
import { fetchHourlyWeather, MAX_PAST_DAYS, type HourlyWeatherRow } from './hourly-weather'
import { narratePlan, type NarratorCall } from './narrate'

export interface DecisionFarmResult {
  farm: string
  blocks: number
  /** Blocks bound to a pack. */
  bound: number
  evaluated: number
  recommendations: number
  /** New rows written to the recommendation log (0 in a dry run). */
  logged: number
  /** The arbitrator's plan for the farm: its status and how many actions it placed, deferred, or could not place though mandatory. */
  planStatus: FarmPlan['status'] | null
  planned: number
  deferred: number
  unscheduledMandatory: number
  /** Whether the plan's explanation came from the model or from the rules. */
  narration: 'model' | 'rules' | null
  errors: string[]
}

export interface DecisionRunOptions {
  now?: Date
  /** Compute everything but write nothing. */
  dryRun?: boolean
  farmId?: string
  /** Receives every block result, so a dry run can be inspected. */
  collect?: { blockId: string; result: BlockDayResult }[]
  /** Receives every farm plan. */
  collectPlans?: { farmId: string; plan: FarmPlan }[]
  /** Ask the model to write the plan's explanation. Off by default: the rule-based text costs nothing. */
  narrate?: boolean
  narrationLanguage?: NarrationLanguage
  /** Replaces the model call, for tests. */
  narratorCall?: NarratorCall
}

/**
 * Soil evaporation layer when the block's soil profile is not described:
 * FAO-56 gives 0.10 to 0.15 m for the layer depth and about 8 to 10 mm of
 * readily evaporable water for a loam (Table 19). Results computed with
 * these carry the SOIL_EVAPORATION_DEFAULTS flag.
 */
const DEFAULT_ZE_M = 0.1
const DEFAULT_REW_MM = 8

/** Days of past weather for a block's first run. */
const FIRST_RUN_PAST_DAYS = 8
const FORECAST_DAYS = 4
const SOIL_WINDOW_HOURS = 72
const UPSERT_CHUNK = 500
const LAB_ROWS_MAX = 200
const OBSERVATION_ROWS_MAX = 2000
/** How far back a standing task can have been proposed and still be open. */
const STANDING_LOOKBACK_DAYS = 45
const STANDING_ROWS_MAX = 1000

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** A percentage stored on the block as a volumetric fraction. */
const fraction = (pct: unknown): number | null => {
  const n = num(pct)
  return n === null ? null : n / 100
}

function localDate(isoTimestamp: string, utcOffsetMinutes: number): string {
  return new Date(Date.parse(isoTimestamp) + utcOffsetMinutes * 60_000).toISOString().slice(0, 10)
}

function weatherRow(farmId: string, r: HourlyWeatherRow, fetchedAt: string) {
  return {
    farm_id: farmId,
    at: r.at,
    local_date: r.localDate,
    local_hour: r.localHour,
    temp_c: r.tempC,
    rh_pct: r.rhPct,
    wind_10m_ms: r.wind10mMs,
    shortwave_wm2: r.shortwaveWm2,
    precip_mm: r.precipMm,
    precip_prob_pct: r.precipProbPct,
    dew_point_c: r.dewPointC,
    is_forecast: r.forecast,
    source: 'open-meteo',
    fetched_at: fetchedAt,
  }
}

export async function runDecisionEngine(admin: any, opts: DecisionRunOptions = {}): Promise<DecisionFarmResult[]> {
  const now = opts.now ?? new Date()
  const results: DecisionFarmResult[] = []
  const packCache = new Map<string, PackContext | string>()

  async function loadPack(packId: string, version: string): Promise<PackContext | string> {
    const key = `${packId}@${version}`
    const cached = packCache.get(key)
    if (cached) return cached
    const { data, error } = await admin.from('crop_packs').select('content').eq('pack_id', packId).eq('version', version).maybeSingle()
    let loaded: PackContext | string
    if (error) loaded = `Pack ${key} could not be loaded: ${error.message}`
    else if (!data) loaded = `Pack ${key} is not installed`
    else {
      const parsed = packSchema.safeParse(data.content)
      // No farm calibration exists yet, so the pack's start values are the values in force.
      loaded = parsed.success ? createPackContext(parsed.data) : `Pack ${key} does not match the pack format of this platform version`
    }
    packCache.set(key, loaded)
    return loaded
  }

  let farmQuery = admin.from('farms').select('id, name, gps_lat, gps_lng, elevation_m')
  if (opts.farmId) farmQuery = farmQuery.eq('id', opts.farmId)
  const { data: farms, error: farmsError } = await farmQuery
  if (farmsError) throw new Error(`Could not load farms: ${farmsError.message}`)

  for (const farm of farms ?? []) {
    const r: DecisionFarmResult = { farm: farm.name, blocks: 0, bound: 0, evaluated: 0, recommendations: 0, logged: 0, planStatus: null, planned: 0, deferred: 0, unscheduledMandatory: 0, narration: null, errors: [] }
    results.push(r)

    const { data: blocks, error: blocksError } = await admin
      .from('blocks')
      .select(
        'id, crop_type, variety, tree_count, area, area_unit, field_capacity, wilting_point, root_depth_m, planting_year, planting_date, pack_id, pack_version, pack_variety_id, canopy_cover_fraction, canopy_height_m, wetted_fraction, expected_yield_kg_ha, expected_yield_season',
      )
      .eq('farm_id', farm.id)
    if (blocksError) {
      r.errors.push(`Could not load blocks: ${blocksError.message}`)
      continue
    }
    r.blocks = blocks?.length ?? 0
    const bound: any[] = (blocks ?? []).filter((b: any) => b.pack_id && b.pack_version)
    r.bound = bound.length
    if (bound.length === 0) continue

    const lat = num(farm.gps_lat)
    const lng = num(farm.gps_lng)
    if (lat === null || lng === null) {
      r.errors.push('Farm has no GPS position, so weather cannot be fetched')
      continue
    }
    const blockIds: string[] = bound.map(b => b.id)

    // The latest stored state of each block carries its water balance forward.
    const { data: stateRows } = await admin
      .from('block_engine_state')
      .select('block_id, state_date, carried, carried_models')
      .in('block_id', blockIds)
      .order('state_date', { ascending: false })
      .limit(blockIds.length * 10)
    const carriedByBlock = new Map<string, CarriedWaterState | null>()
    const modelsByBlock = new Map<string, CarriedModels | null>()
    for (const row of stateRows ?? []) {
      if (carriedByBlock.has(row.block_id)) continue
      carriedByBlock.set(row.block_id, row.carried ?? null)
      modelsByBlock.set(row.block_id, row.carried_models ?? null)
    }

    const today = now.toISOString().slice(0, 10)
    const oldest = blockIds
      .map(id => carriedByBlock.get(id)?.through)
      .reduce<number>((days, through) => Math.max(days, through ? daysBetween(through, today) + 2 : FIRST_RUN_PAST_DAYS), FIRST_RUN_PAST_DAYS)
    // Degree-days run from each pest's biofix, so the weather must reach back to where each model stands.
    const modelStart = blockIds
      .flatMap(id => Object.values(modelsByBlock.get(id)?.pests ?? {}))
      .map(p => p.through ?? p.biofix)
      .reduce<number>((days, from) => Math.max(days, from ? daysBetween(from, today) + 2 : 0), 0)
    const weather = await fetchHourlyWeather(lat, lng, Math.min(Math.max(oldest, modelStart), MAX_PAST_DAYS), FORECAST_DAYS, now)
    if (!weather || weather.rows.length === 0) {
      r.errors.push('Hourly weather could not be fetched')
      continue
    }
    const elevationM = num(farm.elevation_m) ?? weather.elevationM

    if (!opts.dryRun) {
      const fetchedAt = now.toISOString()
      for (let i = 0; i < weather.rows.length; i += UPSERT_CHUNK) {
        const chunk = weather.rows.slice(i, i + UPSERT_CHUNK).map(row => weatherRow(farm.id, row, fetchedAt))
        const { error } = await admin.from('weather_hourly').upsert(chunk, { onConflict: 'farm_id,at' })
        if (error) {
          r.errors.push(`Hourly weather not saved: ${error.message}`)
          break
        }
      }
      if (num(farm.elevation_m) === null && weather.elevationM !== null) {
        const { error } = await admin.from('farms').update({ elevation_m: weather.elevationM }).eq('id', farm.id)
        if (error) r.errors.push(`Elevation not saved: ${error.message}`)
      }
    }

    const { data: policyRow } = await admin.from('farm_policy').select('*').eq('farm_id', farm.id).maybeSingle()
    const policy = toPolicy(policyRow)

    const { data: phenology } = await admin
      .from('phenology_latest')
      .select('block_id, current_stage, source, recorded_at, estimated_harvest_start')
      .in('block_id', blockIds)
    const stageByBlock = new Map<string, any>((phenology ?? []).map((p: any) => [p.block_id, p]))

    const firstDate = weather.rows[0].localDate
    const { data: irrigations } = await admin
      .from('activity_log')
      .select('block_id, performed_at, details')
      .in('block_id', blockIds)
      .eq('activity_type', 'irrigation')
      .gte('performed_at', `${firstDate}T00:00:00Z`)

    // Laboratory analyses: a block's own, or the farm-wide one when it has none. Newest first.
    const { data: labRows } = await admin
      .from('soil_water_readings')
      .select('block_id, recorded_at, test_type, soil_ec')
      .eq('farm_id', farm.id)
      .eq('source', 'manual')
      .in('test_type', ['soil', 'water'])
      .not('soil_ec', 'is', null)
      .order('recorded_at', { ascending: false })
      .limit(LAB_ROWS_MAX)
    const latestLab = (blockId: string, type: 'soil' | 'water') => {
      const own = (labRows ?? []).find((l: any) => l.test_type === type && l.block_id === blockId)
      const row = own ?? (labRows ?? []).find((l: any) => l.test_type === type && (l.block_id === null || l.block_id === undefined))
      const value = row ? num(row.soil_ec) : null
      return row && value !== null ? { value, at: String(row.recorded_at) } : null
    }

    // Newest sample first, so the first row seen per block is its latest.
    const { data: tissueRows } = await admin
      .from('tissue_samples')
      .select('block_id, sampled_at, nutrients')
      .in('block_id', blockIds)
      .order('sampled_at', { ascending: false })
    const latestTissue = new Map<string, any>()
    for (const t of tissueRows ?? []) if (!latestTissue.has(t.block_id)) latestTissue.set(t.block_id, t)

    const year = Number(weather.localToday.slice(0, 4))
    const { data: fertigations } = await admin
      .from('activity_log')
      .select('block_id')
      .in('block_id', blockIds)
      .eq('activity_type', 'fertigation')
      .gte('performed_at', `${year}-01-01T00:00:00Z`)
    const fertigatedBlocks = new Set<string>((fertigations ?? []).map((f: any) => f.block_id))

    // The farm's product library: label values the spray safeguards read.
    const { data: productRows } = await admin.from('farm_products').select('*').eq('farm_id', farm.id)
    const cropOf = (b: any) => String(b.pack_id)
    const labelsFor = (b: any): ProductLabel[] =>
      (productRows ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        targets: Array.isArray(p.targets) ? p.targets : [],
        modeOfActionGroup: p.mode_of_action_group ?? null,
        maxWindMs: num(p.max_wind_ms),
        minWindMs: num(p.min_wind_ms),
        rainfastHours: num(p.rainfast_hours),
        phiDays: num(p.phi_days),
        reiHours: num(p.rei_hours),
        maxApplicationsPerSeason: num(p.max_applications_per_season),
        beeToxic: typeof p.bee_toxic === 'boolean' ? p.bee_toxic : null,
        // Registered only when the library lists this block's crop for the product.
        registered: Array.isArray(p.registered_crops) ? p.registered_crops.includes(cropOf(b)) : null,
        approved: Boolean(p.approved_at),
      }))

    const seasonStart = `${year}-01-01`
    const { data: sprayRows } = await admin
      .from('activity_log')
      .select('block_id, performed_at, details')
      .in('block_id', blockIds)
      .eq('activity_type', 'spraying')
      .gte('performed_at', `${seasonStart}T00:00:00Z`)
    const { data: observationRows } = await admin
      .from('field_observations')
      .select('block_id, kind, subject, observed_on, data')
      .in('block_id', blockIds)
      .gte('observed_on', seasonStart)
      .order('observed_on', { ascending: true })
      .limit(OBSERVATION_ROWS_MAX)
    const { data: eventRows } = await admin
      .from('phenology_events')
      .select('block_id, event_type, observed_on')
      .in('block_id', blockIds)
      .gte('observed_on', seasonStart)

    const { data: sensors } = await admin.from('sensors').select('block_id').eq('farm_id', farm.id)
    const sensorBlocks = new Set<string>((sensors ?? []).map((s: any) => s.block_id).filter(Boolean))
    const soilSince = new Date(now.getTime() - SOIL_WINDOW_HOURS * 3_600_000).toISOString()
    const farmActions: ProposedAction[] = []

    // Shadow or Live per pack and engine; an engine with no row is in Shadow.
    const { data: modeRows } = await admin.from('farm_engine_modes').select('pack_id, engine_id, mode').eq('farm_id', farm.id)
    const liveEngines = new Set<string>((modeRows ?? []).filter((m: any) => m.mode === 'live').map((m: any) => `${m.pack_id}:${m.engine_id}`))
    const modeOf = (a: ProposedAction): 'shadow' | 'live' => (liveEngines.has(`${a.packId}:${a.engineId}`) ? 'live' : 'shadow')
    const reentryBlockedUntil: Record<string, string | null> = {}
    const stateSummary: Record<string, unknown> = {}

    for (const b of bound) {
      try {
        const pack = await loadPack(b.pack_id, b.pack_version)
        if (typeof pack === 'string') {
          r.errors.push(`Block ${b.id}: ${pack}`)
          continue
        }

        const areaHa = toHectares(b.area, b.area_unit)
        const treeCount = num(b.tree_count)

        // Litres per tree, as the activity log records an irrigation, to a depth over the block.
        const irrigationMmByDate: Record<string, number> = {}
        if (areaHa !== null && treeCount !== null) {
          for (const row of irrigations ?? []) {
            if (row.block_id !== b.id) continue
            const litresPerTree = num(row.details?.volume_per_tree_l)
            if (litresPerTree === null || litresPerTree <= 0) continue
            const date = localDate(row.performed_at, weather.utcOffsetMinutes)
            irrigationMmByDate[date] = (irrigationMmByDate[date] ?? 0) + (litresPerTree * treeCount) / (areaHa * 10_000)
          }
        }

        let measuredTheta: { value: number; at: string } | null = null
        if (sensorBlocks.has(b.id)) {
          const { data: soil } = await admin
            .from('soil_water_readings')
            .select('recorded_at, soil_moisture')
            .eq('block_id', b.id)
            .eq('source', 'sensor')
            .not('soil_moisture', 'is', null)
            .gte('recorded_at', soilSince)
            .order('recorded_at', { ascending: true })
            .limit(500)
          const series = (soil ?? []).flatMap((s: any) => {
            const value = num(s.soil_moisture)
            return value === null ? [] : [{ at: s.recorded_at as string, value }]
          })
          // Only readings that pass the sensor checks may correct the balance.
          const quality = checkSeries(series, { ...SOIL_MOISTURE_RULES, failedAfterHours: policy.sensorFailedAfterHours }, now)
          const usable = usableReadings(quality)
          const latest = usable[usable.length - 1]
          if (quality.health !== 'failed' && latest) measuredTheta = { value: latest.value / 100, at: latest.at }
        }

        const stage = stageByBlock.get(b.id)
        const plantingYear = num(b.planting_year) ?? (b.planting_date ? Number(String(b.planting_date).slice(0, 4)) : null)
        const tissue = latestTissue.get(b.id)
        const tissueValues: Record<string, number> = {}
        if (tissue?.nutrients && typeof tissue.nutrients === 'object' && !Array.isArray(tissue.nutrients)) {
          for (const [k, v] of Object.entries(tissue.nutrients)) {
            const n = num(v)
            if (n !== null) tissueValues[k] = n
          }
        }
        const applications: SprayApplication[] = (sprayRows ?? [])
          .filter((s: any) => s.block_id === b.id)
          .map((s: any) => ({
            at: String(s.performed_at),
            date: localDate(s.performed_at, weather.utcOffsetMinutes),
            productId: typeof s.details?.product_id === 'string' ? s.details.product_id : null,
            targetId: typeof s.details?.target_id === 'string' ? s.details.target_id : null,
          }))
        const observations: FieldObservation[] = (observationRows ?? [])
          .filter((o: any) => o.block_id === b.id)
          .map((o: any) => ({
            kind: o.kind,
            subject: o.subject ?? null,
            observedOn: String(o.observed_on).slice(0, 10),
            values: o.data && typeof o.data === 'object' ? o.data : {},
          }))
        // Event names as packs write them: petal_fall, not petal-fall.
        const events: Record<string, string> = {}
        for (const e of eventRows ?? []) if (e.block_id === b.id) events[String(e.event_type).replace(/-/g, '_')] = String(e.observed_on).slice(0, 10)

        const result = runBlockDay({
          today: weather.localToday,
          blockId: b.id,
          pack,
          varietyId: b.pack_variety_id ?? null,
          recordedStage: stage ? { stage: stage.current_stage, recordedAt: stage.recorded_at ?? null, source: stage.source ?? null } : null,
          soil: {
            thetaFC: fraction(b.field_capacity),
            thetaWP: fraction(b.wilting_point),
            rootDepthM: num(b.root_depth_m) ?? policy.defaultRootDepthM,
            zeM: DEFAULT_ZE_M,
            rewMm: DEFAULT_REW_MM,
            evaporationDefaults: true,
          },
          canopy: { cover: num(b.canopy_cover_fraction), heightM: num(b.canopy_height_m) },
          wettedFraction: num(b.wetted_fraction),
          areaHa,
          site: { latitudeDeg: lat, elevationM },
          settings: { irrigationEfficiency: policy.efficiency, frostMarginC: policy.frostMarginC, switches: {} },
          weather: weather.rows,
          weatherModelled: true,
          irrigationMmByDate,
          measuredTheta,
          carried: carriedByBlock.get(b.id) ?? null,
          ageYears: plantingYear === null ? null : Math.max(0, year - plantingYear),
          yield: {
            // An estimate counts only for the season it was entered for.
            blockEstimate: num(b.expected_yield_season) === year ? num(b.expected_yield_kg_ha) : null,
            matureTarget: num(policyRow?.n_yield_target_kg_ha),
            pricePerUnit: num(policyRow?.price_per_yield_unit),
          },
          lab: { soilEce: latestLab(b.id, 'soil'), waterEc: latestLab(b.id, 'water') },
          nutrition: {
            // The activity log names a product, not its nutrient content, so a block with entries this season has an unknown amount applied.
            applied: fertigatedBlocks.has(b.id) ? null : {},
            // The application records leaf samples only.
            tissue: tissue ? { sampledAt: String(tissue.sampled_at).slice(0, 10), tissue: 'leaf', values: tissueValues } : null,
          },
          field: {
            observations,
            products: labelsFor(b),
            applications,
            events,
            plannedHarvestDate: stage?.estimated_harvest_start ? String(stage.estimated_harvest_start).slice(0, 10) : null,
            carriedModels: modelsByBlock.get(b.id) ?? null,
          },
          nowIso: now.toISOString(),
        })

        opts.collect?.push({ blockId: b.id, result })
        farmActions.push(...result.actions)
        reentryBlockedUntil[b.id] = typeof result.state.reentry_blocked_until === 'string' ? result.state.reentry_blocked_until : null
        stateSummary[b.id] = { crop: b.crop_type ?? null, variety: b.variety ?? null, phase: result.state.phase ?? null, recorded_stage: result.state.recorded_stage ?? null }
        r.evaluated++
        r.recommendations += result.actions.length
        if (opts.dryRun) continue

        const { error: stateError } = await admin.from('block_engine_state').upsert(
          {
            farm_id: farm.id,
            block_id: b.id,
            state_date: weather.localToday,
            pack_id: pack.packId,
            pack_version: pack.packVersion,
            state: result.state,
            carried: result.carried,
            carried_models: result.carriedModels,
            engines: result.engines,
            updated_at: now.toISOString(),
          },
          { onConflict: 'block_id,state_date' },
        )
        if (stateError) {
          r.errors.push(`Block ${b.id}: state not saved: ${stateError.message}`)
          continue
        }

        if (result.actions.length > 0) {
          const rows = result.actions.map(a => ({
            farm_id: farm.id,
            block_id: b.id,
            run_date: weather.localToday,
            mode: modeOf(a),
            engine_id: a.engineId,
            rule_id: a.ruleId,
            pack_id: a.packId,
            pack_version: a.packVersion,
            crop: b.crop_type ?? null,
            variety: b.variety ?? null,
            action_type: a.actionType,
            target_date: new Date(Date.parse(`${weather.localToday}T00:00:00Z`) + a.earliestDay * 86_400_000).toISOString().slice(0, 10),
            action: a,
            inputs: a.inputsSnapshot,
            calibrated_params: Object.fromEntries(pack.calibrated.map(id => [id, pack.params[id]])),
            flags: a.flags,
            confidence: a.confidence,
            mandatory: a.mandatory,
            expected_outcome: a.expectedOutcome,
          }))
          // The same recommendation on a second run of the day is already in the log: it is not written again.
          const { data: written, error: logError } = await admin
            .from('engine_recommendation_log')
            .upsert(rows, { onConflict: 'block_id,run_date,engine_id,rule_id,action_type,target_date', ignoreDuplicates: true })
            .select('id')
          if (logError) r.errors.push(`Block ${b.id}: recommendations not logged: ${logError.message}`)
          else r.logged += written?.length ?? 0
        }
      } catch (e) {
        r.errors.push(`Block ${b.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    // ── The arbitrator: one plan for the farm across all its blocks ──────────
    try {
      // Standing tasks proposed on earlier days stay in the plan until their window closes. Actions the
      // engines propose afresh every day are not carried: if today's run did not propose one, it no longer holds.
      const since = new Date(Date.parse(`${weather.localToday}T00:00:00Z`) - STANDING_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10)
      const { data: earlier } = await admin
        .from('engine_recommendation_log')
        .select('id, block_id, run_date, action')
        .eq('farm_id', farm.id)
        .gte('run_date', since)
        .lt('run_date', weather.localToday)
        .order('run_date', { ascending: false })
        .limit(STANDING_ROWS_MAX)
      const key = (a: ProposedAction) => [a.blockId, a.engineId, a.ruleId, a.actionType].join(':')
      const seen = new Set(farmActions.map(key))
      const planActions = [...farmActions]
      // The log row behind each action, so a manager's decision can be attached to it.
      const logIdByAction = new Map<string, string>()
      if (!opts.dryRun && farmActions.length > 0) {
        const { data: todays } = await admin
          .from('engine_recommendation_log')
          .select('id, block_id, engine_id, rule_id, action_type, target_date')
          .eq('farm_id', farm.id)
          .eq('run_date', weather.localToday)
        const dateOf = (a: ProposedAction) => new Date(Date.parse(`${weather.localToday}T00:00:00Z`) + a.earliestDay * 86_400_000).toISOString().slice(0, 10)
        for (const a of farmActions) {
          const row = (todays ?? []).find(
            (t: any) => t.block_id === a.blockId && t.engine_id === a.engineId && t.rule_id === a.ruleId && t.action_type === a.actionType && String(t.target_date).slice(0, 10) === dateOf(a),
          )
          if (row?.id) logIdByAction.set(a.actionId, row.id)
        }
      }
      for (const row of earlier ?? []) {
        const a = row.action as ProposedAction | null
        if (!a || a.standing !== true || !blockIds.includes(a.blockId) || seen.has(key(a))) continue
        const elapsed = daysBetween(String(row.run_date).slice(0, 10), weather.localToday)
        if (a.latestDay - elapsed < 0) continue
        seen.add(key(a))
        if (row.id) logIdByAction.set(a.actionId, row.id)
        planActions.push({ ...a, earliestDay: Math.max(0, a.earliestDay - elapsed), latestDay: a.latestDay - elapsed })
      }

      const limits: FarmLimits = {
        labourHrsPerDay: num(policyRow?.daily_labour_hours),
        waterM3PerDay: num(policyRow?.daily_water_m3),
        sprayers: num(policyRow?.sprayer_count),
        // What is left of the season's allocation is not tracked yet.
        waterQuotaM3: null,
        frostProtectionMethod: ['water', 'wind_machine', 'heater'].includes(policyRow?.frost_protection_method) ? policyRow.frost_protection_method : null,
      }
      const plan = buildPlan({ today: weather.localToday, actions: planActions, continuousEngines: CONTINUOUS_ENGINE_IDS, reentryBlockedUntil, limits })
      opts.collectPlans?.push({ farmId: farm.id, plan })
      r.planStatus = plan.status
      r.planned = plan.plan.length
      r.deferred = plan.deferred.length
      r.unscheduledMandatory = plan.unscheduledMandatory.length

      const narrated = await narratePlan(buildNarratorInput(plan, planActions, stateSummary), opts.narrationLanguage ?? 'en', opts.narrate === true, opts.narratorCall)
      r.narration = narrated.source

      // Stored with each entry: the action itself, its log row and its mode, so the plan can be shown and decided on as it stands.
      const actionById = new Map(planActions.map(a => [a.actionId, a]))
      const withAction = <T extends { actionId: string }>(entry: T) => {
        const action = actionById.get(entry.actionId) as ProposedAction
        return { ...entry, logId: logIdByAction.get(entry.actionId) ?? null, mode: modeOf(action), action }
      }

      if (!opts.dryRun) {
        const { error: planError } = await admin.from('farm_plans').upsert(
          {
            farm_id: farm.id,
            plan_date: weather.localToday,
            mode: 'shadow',
            status: plan.status,
            horizon_days: HORIZON_DAYS,
            plan: plan.plan.map(withAction),
            deferred: plan.deferred.map(withAction),
            unscheduled_mandatory: plan.unscheduledMandatory.map(withAction),
            safeguard_events: plan.safeguardEvents,
            notes: plan.notes,
            limits,
            narration: narrated.narration,
            narration_source: narrated.source,
            narration_model: narrated.model,
            narration_language: narrated.language,
            updated_at: now.toISOString(),
          },
          { onConflict: 'farm_id,plan_date' },
        )
        if (planError) r.errors.push(`Plan not saved: ${planError.message}`)
      }
    } catch (e) {
      r.errors.push(`Plan: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return results
}
