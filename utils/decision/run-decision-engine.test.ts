/* eslint-disable @typescript-eslint/no-explicit-any -- the stand-in for the untyped Supabase admin client */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { demoPackRaw } from '@/engines/decision/__fixtures__/demo-pack'
import { packSchema } from '@/engines/pack/schema'
import type { BlockDayResult } from '@/engines/decision/run-block'
import { parseHourlyResponse } from './hourly-weather'
import type { FarmPlan } from '@/engines/arbitrator/plan'
import { runDecisionEngine } from './run-decision-engine'

const NOW = new Date('2026-05-10T04:00:00Z')

/** An Open-Meteo style response: local times at UTC+3, 8 past days and 4 forecast days. */
function openMeteo(coldNightC: number | null = null) {
  const time: string[] = []
  const temp: number[] = []
  const start = Date.parse('2026-05-02T00:00:00Z')
  for (let i = 0; i < 12 * 24; i++) {
    const local = new Date(start + i * 3_600_000).toISOString()
    const date = local.slice(0, 10)
    const hour = Number(local.slice(11, 13))
    time.push(local.slice(0, 16))
    const base = 17 + 7 * Math.cos((2 * Math.PI * (hour - 15)) / 24)
    temp.push(coldNightC !== null && date === '2026-05-11' && hour === 5 ? coldNightC : base)
  }
  const fill = (v: (hour: number) => number) => time.map(t => v(Number(t.slice(11, 13))))
  return {
    elevation: 950,
    utc_offset_seconds: 10_800,
    hourly: {
      time,
      temperature_2m: temp,
      relative_humidity_2m: fill(h => 60 - 25 * Math.cos((2 * Math.PI * (h - 15)) / 24)),
      wind_speed_10m: fill(() => 2.7),
      shortwave_radiation: fill(h => (h >= 6 && h <= 18 ? 600 * Math.sin((Math.PI * (h - 6)) / 12) : 0)),
      precipitation: fill(() => 0),
      precipitation_probability: fill(() => 5),
      dew_point_2m: fill(() => 6),
    },
  }
}

type Row = Record<string, any>

/** A stand-in for the Supabase admin client: tables in memory, the filters the job uses, and a record of writes. */
function fakeAdmin(tables: Record<string, Row[]>) {
  const writes: { table: string; op: string; rows: Row[] }[] = []
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])]
    const q: any = {
      select: () => q,
      eq: (col: string, v: unknown) => ((rows = rows.filter(r => r[col] === v)), q),
      in: (col: string, vs: unknown[]) => ((rows = rows.filter(r => vs.includes(r[col]))), q),
      is: () => q,
      not: () => q,
      gte: () => q,
      lt: () => q,
      order: (col: string, o?: { ascending?: boolean }) => ((rows = rows.sort((a, b) => (a[col] < b[col] ? -1 : 1) * (o?.ascending === false ? -1 : 1))), q),
      limit: () => q,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => void) => resolve({ data: rows, error: null }),
      upsert: (payload: Row | Row[]) => {
        const list = Array.isArray(payload) ? payload : [payload]
        writes.push({ table, op: 'upsert', rows: list })
        const done: any = { select: async () => ({ data: list.map((_, i) => ({ id: String(i) })), error: null }), then: (resolve: (v: { error: null }) => void) => resolve({ error: null }) }
        return done
      },
      update: (payload: Row) => {
        writes.push({ table, op: 'update', rows: [payload] })
        return { eq: async () => ({ error: null }) }
      },
    }
    return q
  }
  return { admin: { from }, writes }
}

const block = (over: Row = {}): Row => ({
  id: 'B1',
  farm_id: 'F1',
  crop_type: 'Demo crop',
  variety: 'Plain',
  tree_count: 400,
  area: 20,
  area_unit: 'Dunm',
  field_capacity: 30,
  wilting_point: 15,
  root_depth_m: 1,
  pack_id: 'demo',
  pack_version: '1.0.0',
  pack_variety_id: 'plain',
  canopy_cover_fraction: 0.5,
  canopy_height_m: 3,
  wetted_fraction: 0.4,
  ...over,
})

function tables(over: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    farms: [{ id: 'F1', name: 'Test farm', gps_lat: 38.2, gps_lng: 33.5, elevation_m: null }],
    blocks: [block()],
    crop_packs: [{ pack_id: 'demo', version: '1.0.0', content: packSchema.parse(demoPackRaw()) }],
    phenology_latest: [{ block_id: 'B1', current_stage: 'leafy', source: 'manual', recorded_at: '2026-05-01T00:00:00Z' }],
    farm_policy: [],
    block_engine_state: [],
    activity_log: [],
    sensors: [],
    ...over,
  }
}

const stubWeather = (body: unknown | null) =>
  vi.stubGlobal('fetch', vi.fn(async () => (body === null ? { ok: false } : { ok: true, json: async () => body })))

afterEach(() => vi.unstubAllGlobals())

describe('parseHourlyResponse', () => {
  const parsed = parseHourlyResponse(openMeteo(), NOW)

  it('keeps the farm-local date and hour and converts the timestamp to UTC', () => {
    expect(parsed.localToday).toBe('2026-05-10')
    expect(parsed.utcOffsetMinutes).toBe(180)
    expect(parsed.elevationM).toBe(950)
    expect(parsed.rows[0]).toMatchObject({ localDate: '2026-05-02', localHour: 0, at: '2026-05-01T21:00:00.000Z' })
  })

  it('marks the hours after the request as forecast', () => {
    const at = (date: string, hour: number) => parsed.rows.find(r => r.localDate === date && r.localHour === hour)!
    expect(at('2026-05-09', 23).forecast).toBe(false)
    expect(at('2026-05-10', 7).forecast).toBe(false)
    expect(at('2026-05-10', 8).forecast).toBe(true)
  })

  it('returns no rows for an empty answer', () => {
    expect(parseHourlyResponse({}, NOW).rows).toEqual([])
  })
})

describe('runDecisionEngine', () => {
  it('evaluates a bound block and stores the weather, the elevation and the state', async () => {
    stubWeather(openMeteo())
    const { admin, writes } = fakeAdmin(tables())
    const collect: { blockId: string; result: BlockDayResult }[] = []
    const [r] = await runDecisionEngine(admin, { now: NOW, collect })

    expect(r).toMatchObject({ farm: 'Test farm', blocks: 1, bound: 1, evaluated: 1, errors: [] })
    expect(collect[0].result.state).toMatchObject({ phase: 'growing', water_balance_through: '2026-05-09', TAW: 150 })
    expect(collect[0].result.engines.irrigation.diagnosis?.outcome).toBe('hold')

    expect(writes.filter(w => w.table === 'weather_hourly').flatMap(w => w.rows)).toHaveLength(288)
    expect(writes.find(w => w.table === 'farms')?.rows[0]).toEqual({ elevation_m: 950 })
    const state = writes.find(w => w.table === 'block_engine_state')!.rows[0]
    expect(state).toMatchObject({ farm_id: 'F1', block_id: 'B1', state_date: '2026-05-10', pack_id: 'demo', pack_version: '1.0.0' })
    expect(state.carried.through).toBe('2026-05-09')
    // Nothing to irrigate; the only entry is the pest engine's standing task to check traps.
    expect(writes.find(w => w.table === 'engine_recommendation_log')!.rows.map(x => x.engine_id)).toEqual(['insect_pest'])
    expect(state.carried_models.pests.grub).toMatchObject({ season: 2026, biofix: null, lastRule: 'G-2' })
  })

  it('logs a recommendation in shadow with its rule, pack version, inputs and flags', async () => {
    stubWeather(openMeteo())
    const carried = { through: '2026-05-09', Dr: 90, De: 22.5, fw: 0.4, etcSinceIrrigation: 30, gapsMm: [], initialAssumed: false, last: { et0: 5, etc: 4.5, raw: 75, taw: 150, ks: 1 } }
    const { admin, writes } = fakeAdmin(tables({ block_engine_state: [{ block_id: 'B1', state_date: '2026-05-09', carried }] }))
    const [r] = await runDecisionEngine(admin, { now: NOW })

    expect(r).toMatchObject({ recommendations: 2, logged: 2, errors: [] })
    const [row] = writes.find(w => w.table === 'engine_recommendation_log')!.rows
    expect(row).toMatchObject({
      farm_id: 'F1',
      block_id: 'B1',
      run_date: '2026-05-10',
      mode: 'shadow',
      engine_id: 'irrigation',
      rule_id: 'D-3',
      pack_id: 'demo',
      pack_version: '1.0.0',
      crop: 'Demo crop',
      variety: 'Plain',
      action_type: 'irrigate',
      target_date: '2026-05-10',
      mandatory: false,
    })
    expect(row.action.quantity).toBe(100)
    expect(row.inputs).toMatchObject({ Dr: 90, RAW: 75 })
    expect(row.flags).toContain('WEATHER_MODELLED')
  })

  it('logs a mandatory frost action for a block in a frost-sensitive phase', async () => {
    stubWeather(openMeteo(-3))
    const { admin, writes } = fakeAdmin(tables({ phenology_latest: [{ block_id: 'B1', current_stage: 'flowers', source: 'manual', recorded_at: null }] }))
    await runDecisionEngine(admin, { now: NOW })
    const rows = writes.find(w => w.table === 'engine_recommendation_log')!.rows.filter(x => x.engine_id === 'frost')
    expect(rows.map(x => [x.engine_id, x.rule_id, x.action_type, x.target_date, x.mandatory])).toEqual([
      ['frost', 'FROST-CRITICAL', 'frost_protect', '2026-05-11', true],
      ['frost', 'FROST-CRITICAL', 'frost_damage_scouting', '2026-05-12', false],
    ])
  })

  it('counts an irrigation from the activity log as a depth over the block', async () => {
    stubWeather(openMeteo())
    const collect: { blockId: string; result: BlockDayResult }[] = []
    // 100 L per tree on 400 trees over 2 ha is 2 mm.
    const log = [{ block_id: 'B1', activity_type: 'irrigation', performed_at: '2026-05-06T09:00:00Z', details: { volume_per_tree_l: 100 } }]
    await runDecisionEngine(fakeAdmin(tables()).admin, { now: NOW, dryRun: true, collect })
    await runDecisionEngine(fakeAdmin(tables({ activity_log: log })).admin, { now: NOW, dryRun: true, collect })
    const [without, withIrrigation] = collect.map(c => c.result.state.Dr as number)
    // 1.8 mm reaches the soil at 90 % efficiency; part of it evaporates again from the wetted surface.
    expect(without - withIrrigation).toBeGreaterThan(0.5)
    expect(without - withIrrigation).toBeLessThanOrEqual(1.8)
  })

  it('feeds the yield, salinity and nutrition engines from the farm records', async () => {
    stubWeather(openMeteo())
    const collect: { blockId: string; result: BlockDayResult }[] = []
    const records = tables({
      blocks: [block({ planting_year: 2018, expected_yield_kg_ha: 2000, expected_yield_season: 2026 })],
      farm_policy: [{ farm_id: 'F1', n_yield_target_kg_ha: 3000, price_per_yield_unit: 5 }],
      soil_water_readings: [
        // A farm-wide water analysis and the block's own soil analysis; an older farm-wide soil analysis is not used.
        { farm_id: 'F1', block_id: null, source: 'manual', test_type: 'water', soil_ec: 1.2, recorded_at: '2026-03-01T00:00:00Z' },
        { farm_id: 'F1', block_id: 'B1', source: 'manual', test_type: 'soil', soil_ec: 0.9, recorded_at: '2026-02-01T00:00:00Z' },
        { farm_id: 'F1', block_id: null, source: 'manual', test_type: 'soil', soil_ec: 4, recorded_at: '2025-02-01T00:00:00Z' },
      ],
      tissue_samples: [{ block_id: 'B1', sampled_at: '2026-04-01', nutrients: { n: 2.3 } }],
    })
    await runDecisionEngine(fakeAdmin(records).admin, { now: NOW, dryRun: true, collect })
    const { state } = collect[0].result
    expect(state).toMatchObject({ age_years: 8, expected_yield: 2000, crop_value: 20000, soil_ece: 0.9, water_ec: 1.2, nutrient_status: { N: 'adequate' }, nutrients_applied: {} })
    expect(state.leaching_fraction).toBeCloseTo(0.1905, 3)
  })

  it('ignores a yield estimate entered for another season', async () => {
    stubWeather(openMeteo())
    const collect: { blockId: string; result: BlockDayResult }[] = []
    const records = tables({ blocks: [block({ planting_year: 2018, expected_yield_kg_ha: 2000, expected_yield_season: 2025 })] })
    await runDecisionEngine(fakeAdmin(records).admin, { now: NOW, dryRun: true, collect })
    expect(collect[0].result.state.yield_block_estimate).toBeNull()
  })

  it('treats the amount applied as unknown once fertigation entries exist this season', async () => {
    stubWeather(openMeteo())
    const collect: { blockId: string; result: BlockDayResult }[] = []
    const records = tables({ activity_log: [{ block_id: 'B1', activity_type: 'fertigation', performed_at: '2026-04-20T08:00:00Z', details: { product_name: 'Something', amount_per_tree: 0.2 } }] })
    await runDecisionEngine(fakeAdmin(records).admin, { now: NOW, dryRun: true, collect })
    expect(collect[0].result.state.nutrients_applied).toBeNull()
  })

  it('feeds the pest and disease engines from observations, the product library and spray entries', async () => {
    stubWeather(openMeteo())
    const product = (over: Row): Row => ({
      farm_id: 'F1', targets: ['spot'], mode_of_action_group: '11', max_wind_ms: 4, min_wind_ms: 0.5, rainfast_hours: 6, phi_days: 14, rei_hours: 24,
      max_applications_per_season: 3, bee_toxic: false, registered_crops: ['demo'], approved_at: '2026-01-01T00:00:00Z', ...over,
    })
    const records = tables({
      phenology_events: [{ block_id: 'B1', event_type: 'petal-fall', observed_on: '2026-04-24' }],
      farm_products: [product({ id: 'P1', name: 'Registered' }), product({ id: 'P2', name: 'Other crop only', registered_crops: ['elsewhere'] }), product({ id: 'P3', name: 'Not approved', approved_at: null })],
      field_observations: [
        { block_id: 'B1', kind: 'trap_check', subject: 'grub', observed_on: '2026-05-04', data: { count: 1 } },
        { block_id: 'B1', kind: 'trap_check', subject: 'grub', observed_on: '2026-05-06', data: { count: 4 } },
        { block_id: 'B1', kind: 'trap_check', subject: 'grub', observed_on: '2026-05-08', data: { count: 7 } },
      ],
      activity_log: [{ block_id: 'B1', activity_type: 'spraying', performed_at: '2026-03-01T08:00:00Z', details: { product_id: 'P1', target_id: 'spot' } }],
    })
    const { admin, writes } = fakeAdmin(records)
    await runDecisionEngine(admin, { now: NOW })

    const stored = writes.find(w => w.table === 'block_engine_state')!.rows[0]
    // Rising counts on 6 and 8 May: the biofix is the first of them.
    expect(stored.carried_models.pests.grub).toMatchObject({ biofix: '2026-05-06', biofixSource: 'rule' })
    expect(stored.state.pests.grub.dd).toBeGreaterThan(0)

    const spray = writes.find(w => w.table === 'engine_recommendation_log')!.rows.find(x => x.action_type === 'spray_spot')!
    expect(spray).toMatchObject({ engine_id: 'disease', rule_id: 'spot:TIMING' })
    const products = spray.inputs.spray_safeguards.products as { productId: string; usable: boolean; blocked: { safeguardId: string }[] }[]
    expect(products.map(p => [p.productId, p.usable, p.blocked.map(b => b.safeguardId)])).toEqual([
      ['P1', true, []],
      ['P2', false, ['SG-SPR-7']],
      ['P3', false, ['LIBRARY']],
    ])
  })

  const dry = { through: '2026-05-09', Dr: 90, De: 22.5, fw: 0.4, etcSinceIrrigation: 30, gapsMm: [], initialAssumed: false, last: { et0: 5, etc: 4.5, raw: 75, taw: 150, ks: 1 } }
  const twoDryBlocks = (policy: Row = {}) =>
    tables({
      blocks: [block(), block({ id: 'B2' })],
      phenology_latest: ['B1', 'B2'].map(id => ({ block_id: id, current_stage: 'leafy', source: 'manual', recorded_at: null })),
      block_engine_state: ['B1', 'B2'].map(id => ({ block_id: id, state_date: '2026-05-09', carried: dry })),
      farm_policy: [{ farm_id: 'F1', ...policy }],
    })

  it('makes one plan for the farm and stores it in shadow with rule-based text', async () => {
    stubWeather(openMeteo())
    const { admin, writes } = fakeAdmin(twoDryBlocks())
    const [r] = await runDecisionEngine(admin, { now: NOW })
    // Per block: one irrigation and one standing pest task.
    expect(r).toMatchObject({ planStatus: 'OPTIMAL', planned: 4, deferred: 0, unscheduledMandatory: 0, narration: 'rules', errors: [] })
    const stored = writes.find(w => w.table === 'farm_plans')!.rows[0]
    expect(stored).toMatchObject({ farm_id: 'F1', plan_date: '2026-05-10', mode: 'shadow', status: 'OPTIMAL', horizon_days: 7, narration_source: 'rules', narration_model: null })
    expect(stored.plan).toHaveLength(4)
    // Each entry carries the action itself and its mode, so the plan can be shown without the log.
    expect(stored.plan[0]).toMatchObject({ mode: 'shadow', action: { blockId: expect.any(String), description: expect.any(String) } })
    expect(stored.narration.action_explanations).toHaveLength(4)
    expect(stored.notes).toContain('No daily water limit is set for the farm, so water does not limit the plan')
  })

  it("shares the farm's daily water between its blocks", async () => {
    stubWeather(openMeteo())
    const plans: { farmId: string; plan: FarmPlan }[] = []
    // Each block needs 2000 m3 (100 mm over 2 ha) within two days; 2500 m3 a day lets one run today and one tomorrow.
    await runDecisionEngine(fakeAdmin(twoDryBlocks({ daily_water_m3: 2500 })).admin, { now: NOW, dryRun: true, collectPlans: plans })
    const irrigations = plans[0].plan.plan.filter(p => p.actionId.includes(':irrigation:'))
    expect(irrigations.map(p => p.day).sort()).toEqual([0, 1])
    // 1900 m3 a day cannot carry either block.
    plans.length = 0
    const [r] = await runDecisionEngine(fakeAdmin(twoDryBlocks({ daily_water_m3: 1900 })).admin, { now: NOW, dryRun: true, collectPlans: plans })
    expect(r.deferred).toBe(2)
    expect(plans[0].plan.deferred.map(d => d.reason)).toEqual(['resource_limit', 'resource_limit'])
  })

  it('keeps a standing task from an earlier day in the plan until its window closes, and drops a daily one', async () => {
    stubWeather(openMeteo())
    const earlier = (over: Row) => ({ actionId: 'x', blockId: 'B1', engineId: 'canopy_pruning', ruleId: 'maintain', actionType: 'seasonal_task', description: 'Maintenance pruning', quantity: null, unit: null, earliestDay: 0, latestDay: 7, expectedLossAvoided: 0, delayCostPerDay: 0, cost: 0, labourHrs: 0, waterM3: 0, equipment: [], confidence: 1, mandatory: false, inputsSnapshot: {}, evidence: null, expectedOutcome: null, flags: [], requiresEntry: true, standing: true, ...over })
    const log = [
      { farm_id: 'F1', block_id: 'B1', run_date: '2026-05-07', action: earlier({ actionId: 'standing-open' }) },
      { farm_id: 'F1', block_id: 'B1', run_date: '2026-05-01', action: earlier({ actionId: 'standing-closed', ruleId: 'old' }) },
      { farm_id: 'F1', block_id: 'B1', run_date: '2026-05-09', action: earlier({ actionId: 'daily', engineId: 'frost', ruleId: 'FROST-WARNING', actionType: 'frost_protect', standing: false }) },
    ]
    const plans: { farmId: string; plan: FarmPlan }[] = []
    await runDecisionEngine(fakeAdmin(tables({ engine_recommendation_log: log })).admin, { now: NOW, dryRun: true, collectPlans: plans })
    const ids = plans[0].plan.plan.map(p => p.actionId)
    expect(ids).toContain('standing-open')
    expect(ids).not.toContain('standing-closed')
    expect(ids).not.toContain('daily')
  })

  it('asks the model for the explanation only when told to, and stores what passes the check', async () => {
    stubWeather(openMeteo())
    const call = vi.fn(async (input: { plan: { action_id: string }[] }, _language: string, model: string) => ({
      output: {
        action_explanations: input.plan.map(p => ({ action_id: p.action_id, text: 'Explained.' })),
        deferred_explanations: [],
        conflicts: [],
        observation_requests: [],
        task_drafts: [],
      },
      model,
    }))
    const { admin, writes } = fakeAdmin(twoDryBlocks())
    const [r] = await runDecisionEngine(admin, { now: NOW, narrate: true, narrationLanguage: 'tr', narratorCall: call as never })
    expect(call).toHaveBeenCalledTimes(1)
    expect(r.narration).toBe('model')
    expect(writes.find(w => w.table === 'farm_plans')!.rows[0]).toMatchObject({ narration_source: 'model', narration_language: 'tr', narration_model: 'google/gemini-2.5-flash' })
  })

  it('writes nothing in a dry run', async () => {
    stubWeather(openMeteo())
    const { admin, writes } = fakeAdmin(tables())
    const [r] = await runDecisionEngine(admin, { now: NOW, dryRun: true })
    expect(r.evaluated).toBe(1)
    expect(writes).toEqual([])
  })

  it('skips a farm with no bound block without fetching weather', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { admin, writes } = fakeAdmin(tables({ blocks: [block({ pack_id: null, pack_version: null })] }))
    const [r] = await runDecisionEngine(admin, { now: NOW })
    expect(r).toMatchObject({ blocks: 1, bound: 0, evaluated: 0, errors: [] })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(writes).toEqual([])
  })

  it('reports a pack that is not installed and a weather service that fails', async () => {
    stubWeather(openMeteo())
    const missing = await runDecisionEngine(fakeAdmin(tables({ crop_packs: [] })).admin, { now: NOW })
    expect(missing[0].errors).toEqual(['Block B1: Pack demo@1.0.0 is not installed'])

    stubWeather(null)
    const down = await runDecisionEngine(fakeAdmin(tables()).admin, { now: NOW })
    expect(down[0].errors).toEqual(['Hourly weather could not be fetched'])
    expect(down[0].evaluated).toBe(0)
  })

  it('returns counts and errors only, no recommendation text', async () => {
    stubWeather(openMeteo(-3))
    const { admin } = fakeAdmin(tables({ phenology_latest: [{ block_id: 'B1', current_stage: 'flowers', source: 'manual', recorded_at: null }] }))
    const [r] = await runDecisionEngine(admin, { now: NOW })
    expect(Object.keys(r).sort()).toEqual(['blocks', 'bound', 'deferred', 'errors', 'evaluated', 'farm', 'logged', 'narration', 'planStatus', 'planned', 'recommendations', 'unscheduledMandatory'])
    expect(Object.values(r).every(v => typeof v !== 'string' || v.length < 20)).toBe(true)
  })
})
