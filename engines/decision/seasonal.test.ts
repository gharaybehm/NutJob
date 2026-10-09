import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { createPackContext } from '../pack/context'
import { loadPackSource } from '../pack/load'
import { packSchema } from '../pack/schema'
import { preHarvestHold } from '../safeguards/harvest'
import type { ProductLabel, SprayApplication } from '../safeguards/spray'
import { demoContext } from './__fixtures__/demo-pack'
import type { FieldObservation } from './field-data'
import { runBlockDay, type BlockDayInput } from './run-block'
import type { SeasonPlan } from './season-plan'
import { addDays, type HourlyWeatherPoint } from './weather'

const TODAY = '2026-05-10'

interface HourShape {
  tempC?: number
  precipMm?: number
}

/** Seven past days and four forecast days; `shape` can set the temperature or rain of any hour. */
function weather(today = TODAY, shape: (date: string, hour: number) => HourShape = () => ({})): HourlyWeatherPoint[] {
  return Array.from({ length: 11 }, (_, i) => addDays(today, i - 7)).flatMap(localDate =>
    Array.from({ length: 24 }, (_, h) => {
      const s = shape(localDate, h)
      return {
        localDate,
        localHour: h,
        tempC: s.tempC ?? 17 + 7 * Math.cos((2 * Math.PI * (h - 15)) / 24),
        rhPct: 60,
        wind10mMs: 2.7,
        shortwaveWm2: h >= 6 && h <= 18 ? 500 * Math.sin((Math.PI * (h - 6)) / 12) : 0,
        precipMm: s.precipMm ?? 0,
        precipProbPct: localDate >= today ? 0 : null,
        forecast: localDate >= today,
      }
    }),
  )
}

const rainOn = (...daysAhead: number[]) => weather(TODAY, (date, h) => ({ precipMm: daysAhead.some(d => date === addDays(TODAY, d)) && h === 10 ? 4 : 0 }))

function input(over: Partial<BlockDayInput> = {}, today = TODAY): BlockDayInput {
  return {
    today,
    blockId: 'B1',
    pack: demoContext(),
    varietyId: 'plain',
    recordedStage: { stage: 'leafy', recordedAt: null, source: 'manual' },
    soil: { thetaFC: 0.3, thetaWP: 0.15, rootDepthM: 1, zeM: 0.1, rewMm: 8, evaporationDefaults: true },
    canopy: { cover: 0.5, heightM: 3 },
    wettedFraction: 0.4,
    areaHa: 2,
    site: { latitudeDeg: 38.2, elevationM: 950 },
    settings: { irrigationEfficiency: 0.9, frostMarginC: 2, switches: {} },
    weather: weather(today),
    weatherModelled: true,
    irrigationMmByDate: {},
    measuredTheta: null,
    carried: null,
    ageYears: 8,
    yield: { blockEstimate: null, matureTarget: null, pricePerUnit: null },
    lab: { soilEce: null, waterEc: null },
    nutrition: { applied: {}, tissue: null },
    ...over,
  }
}

const label = (over: Partial<ProductLabel> = {}): ProductLabel => ({
  id: 'P1',
  name: 'Product one',
  targets: ['weeds'],
  modeOfActionGroup: '9',
  maxWindMs: 4,
  minWindMs: 0.5,
  rainfastHours: 6,
  phiDays: 14,
  reiHours: 24,
  maxApplicationsPerSeason: 3,
  beeToxic: false,
  registered: true,
  approved: true,
  ...over,
})

const spray = (daysAgo: number, over: Partial<SprayApplication> = {}): SprayApplication => ({
  date: addDays(TODAY, -daysAgo),
  at: `${addDays(TODAY, -daysAgo)}T08:00:00Z`,
  productId: 'P1',
  targetId: 'weeds',
  ...over,
})

const ripeness = (pct: number): FieldObservation => ({ kind: 'ripeness', subject: null, observedOn: addDays(TODAY, -1), values: { pct } })
const by = (r: ReturnType<typeof runBlockDay>, engine: string) => r.actions.filter(a => a.engineId === engine)
const plan = (r: ReturnType<typeof runBlockDay>, engine: string) => r.state[`${engine}_plan`] as SeasonPlan
const flowering = { stage: 'flowers', recordedAt: null, source: 'manual' }

describe('season plans', () => {
  it('proposes a phase task when the block enters the phase, once in the season', () => {
    const first = runBlockDay(input({ recordedStage: flowering }))
    expect(by(first, 'pollination')).toMatchObject([{ ruleId: 'place_hives', actionType: 'seasonal_task', description: 'Place the hives', earliestDay: 0, latestDay: 7 }])
    const next = runBlockDay(input({ recordedStage: flowering, field: { carriedModels: first.carriedModels } }))
    expect(by(next, 'pollination')).toEqual([])
  })

  it('proposes it again in a new season', () => {
    const first = runBlockDay(input({ recordedStage: flowering }))
    const nextYear = '2027-05-10'
    const again = runBlockDay(input({ recordedStage: flowering, weather: weather(nextYear), field: { carriedModels: first.carriedModels } }, nextYear))
    expect(by(again, 'pollination').map(a => a.ruleId)).toEqual(['place_hives'])
  })

  it('waits for the phase', () => {
    const r = runBlockDay(input())
    expect(by(r, 'pollination')).toEqual([])
    expect(plan(r, 'pollination').notes).toEqual(['place_hives: waiting for the flowering phase'])
  })

  it('places an event task by its offset from the event date', () => {
    const due = runBlockDay(input({ field: { plannedHarvestDate: addDays(TODAY, 14) } }))
    expect(by(due, 'weed_groundcover')).toMatchObject([{ ruleId: 'clean_floor', earliestDay: 0, latestDay: 7 }])
    const early = runBlockDay(input({ field: { plannedHarvestDate: addDays(TODAY, 40) } }))
    expect(by(early, 'weed_groundcover')).toEqual([])
    expect(plan(early, 'weed_groundcover').notes).toContain('clean_floor: waiting for 19 days until its window opens')
    const none = runBlockDay(input())
    expect(plan(none, 'weed_groundcover').notes).toContain('clean_floor: waiting for a planned_harvest date')
  })

  it('applies a template only to blocks of the age it names', () => {
    expect(by(runBlockDay(input({ ageYears: 8 })), 'canopy_pruning').map(a => a.ruleId)).toEqual(['maintain'])
    expect(by(runBlockDay(input({ ageYears: 2 })), 'canopy_pruning').map(a => a.ruleId)).toEqual(['shape_young'])
    const unknown = runBlockDay(input({ ageYears: null }))
    expect(by(unknown, 'canopy_pruning')).toEqual([])
    expect(plan(unknown, 'canopy_pruning').notes).toContain('maintain: the planting year of the block is not known')
  })

  it('moves a weather-gated task to the first day with enough dry days after it', () => {
    expect(by(runBlockDay(input()), 'canopy_pruning')[0]).toMatchObject({ ruleId: 'maintain', earliestDay: 0, evidence: 'SRC' })
    // Rain tomorrow: with two dry days needed, the first workable day is the day after.
    expect(by(runBlockDay(input({ weather: rainOn(1) })), 'canopy_pruning')[0].earliestDay).toBe(2)
  })

  it('holds a weather-gated task while the forecast shows no dry window', () => {
    const r = runBlockDay(input({ weather: rainOn(0, 1, 2, 3) }))
    expect(by(r, 'canopy_pruning')).toEqual([])
    expect(plan(r, 'canopy_pruning').notes).toContain('maintain: held, the forecast shows no 2 dry day(s) in its window')
    // Not marked as proposed, so it comes up once the weather allows.
    const later = runBlockDay(input({ field: { carriedModels: r.carriedModels } }))
    expect(by(later, 'canopy_pruning').map(a => a.ruleId)).toEqual(['maintain'])
  })

  it('sends a spraying task through the spray safeguards', () => {
    const r = runBlockDay(input({ field: { events: { petal_fall: addDays(TODAY, -5) }, products: [label(), label({ id: 'P2', name: 'No label', maxWindMs: null })] } }))
    const [a] = by(r, 'weed_groundcover')
    expect(a).toMatchObject({ ruleId: 'spring_herbicide', actionType: 'spray_weeds', unit: 'spray application' })
    const safeguards = a.inputsSnapshot.spray_safeguards as { products: { productId: string; usable: boolean }[]; openDays: number[] }
    expect(safeguards.products.map(p => [p.productId, p.usable])).toEqual([['P1', true], ['P2', false]])
    expect(safeguards.openDays).toEqual([0, 1, 2, 3])
  })
})

describe('pollination engine', () => {
  it('gives the hives for the block from the pack density', () => {
    const r = runBlockDay(input({ recordedStage: flowering }))
    expect(r.state.pollination).toMatchObject({ hivesRecommended: 4 })
    expect(r.engines.pollination.diagnosis?.notes[0]).toBe('4 hive(s) for the block')
  })

  it('warns of a day with no hour fit for pollinator flight, once per day', () => {
    const tomorrow = addDays(TODAY, 1)
    const cold = weather(TODAY, date => (date === tomorrow ? { tempC: 8 } : {}))
    const r = runBlockDay(input({ recordedStage: flowering, weather: cold }))
    const warnings = by(r, 'pollination').filter(a => a.actionType === 'pollination_weather_warning')
    expect(warnings).toMatchObject([{ ruleId: 'POLL-FLIGHT-WEATHER', earliestDay: 1, latestDay: 1 }])
    const again = runBlockDay(input({ recordedStage: flowering, weather: cold, field: { carriedModels: r.carriedModels } }))
    expect(by(again, 'pollination')).toEqual([])
  })

  it('does not assess flight weather outside the bee-protection phases', () => {
    const r = runBlockDay(input({ weather: weather(TODAY, () => ({ tempC: 5 })) }))
    expect((r.state.pollination as { poorFlightDays: string[] }).poorFlightDays).toEqual([])
  })
})

describe('canopy and pruning engine', () => {
  it('asks for the canopy to be measured when it is not, once in the season', () => {
    const r = runBlockDay(input({ canopy: { cover: null, heightM: null } }))
    const request = by(r, 'canopy_pruning').filter(a => a.actionType === 'canopy_measurement')
    expect(request).toMatchObject([{ ruleId: 'CANOPY-NOT-MEASURED' }])
    const again = runBlockDay(input({ canopy: { cover: null, heightM: null }, field: { carriedModels: r.carriedModels } }))
    expect(by(again, 'canopy_pruning').filter(a => a.actionType === 'canopy_measurement')).toEqual([])
  })

  it('asks for nothing when the canopy is measured', () => {
    expect(by(runBlockDay(input()), 'canopy_pruning').filter(a => a.actionType === 'canopy_measurement')).toEqual([])
  })
})

describe('harvest engine', () => {
  it('reports ready from the maturity indicator and proposes the harvest once', () => {
    const r = runBlockDay(input({ field: { observations: [ripeness(85)] } }))
    expect(r.state.harvest).toMatchObject({ ready: true, started: false, holdDays: 0 })
    expect(by(r, 'harvest')).toMatchObject([{ ruleId: 'HARV-READY', actionType: 'harvest', earliestDay: 0, latestDay: 7 }])
    const again = runBlockDay(input({ field: { observations: [ripeness(85)], carriedModels: r.carriedModels } }))
    expect(by(again, 'harvest')).toEqual([])
  })

  it('does not propose a harvest that is not ready, or cannot be judged', () => {
    const notYet = runBlockDay(input({ field: { observations: [ripeness(50)] } }))
    expect(notYet.state.harvest).toMatchObject({ ready: false })
    expect(by(notYet, 'harvest')).toEqual([])
    const unknown = runBlockDay(input())
    expect(unknown.state.harvest).toMatchObject({ ready: null })
    expect(unknown.engines.harvest.diagnosis?.notes).toContain('No ripeness observation this season')
  })

  it('SG-HAR-1: holds the harvest until the pre-harvest interval of the last spray has passed', () => {
    const r = runBlockDay(input({ field: { observations: [ripeness(85)], products: [label()], applications: [spray(5)] } }))
    expect(r.state.harvest).toMatchObject({ phiClearFrom: addDays(TODAY, 9), holdDays: 9 })
    const [a] = by(r, 'harvest')
    expect(a).toMatchObject({ earliestDay: 9, latestDay: 16 })
    expect(a.description).toMatch(/Not before day 9 \(SG-HAR-1\): a pre-harvest interval runs until/)
  })

  it('SG-HAR-1: holds the harvest through a re-entry interval', () => {
    const r = runBlockDay(input({ nowIso: `${TODAY}T10:00:00Z`, field: { observations: [ripeness(85)], products: [label({ phiDays: 0, reiHours: 48 })], applications: [spray(0)] } }))
    // Sprayed at 08:00 today with 48 h re-entry: clear from the day after tomorrow at 08:00, so day 3 is the first full day.
    expect(by(r, 'harvest')[0].earliestDay).toBe(3)
  })

  it('asks for a check by hand when a spray entry cannot be checked', () => {
    const r = runBlockDay(input({ field: { observations: [ripeness(85)], products: [label()], applications: [spray(5, { productId: null })] } }))
    expect(by(r, 'harvest')[0].description).toMatch(/Confirm by hand that no pre-harvest interval is running: 1 spray entry/)
  })

  it('proposes nothing more once the harvest has started, and plans the handling after it', () => {
    const r = runBlockDay(input({ field: { observations: [ripeness(85)], events: { harvest_start: addDays(TODAY, -1) } } }))
    expect(r.state.harvest).toMatchObject({ started: true })
    expect(by(r, 'harvest').map(a => a.ruleId)).toEqual(['dry_crop'])
  })

  it('starts the pre-harvest irrigation cut-off the pack sets, and publishes it for irrigation', () => {
    const near = runBlockDay(input({ field: { plannedHarvestDate: addDays(TODAY, 8) } }))
    expect(near.state.preharvest_irrigation_cutoff).toBe(true)
    expect(by(near, 'harvest').map(a => a.actionType)).toContain('stop_irrigation')
    const far = runBlockDay(input({ field: { plannedHarvestDate: addDays(TODAY, 30) } }))
    expect(far.state.preharvest_irrigation_cutoff).toBe(false)
    expect(by(far, 'harvest')).toEqual([])
  })

  it('computes the pre-harvest hold from the labels only', () => {
    expect(preHarvestHold([spray(5), spray(2, { productId: 'P9' }), spray(1, { productId: null })], [label()])).toEqual({ clearFrom: addDays(TODAY, 9), unknown: 2 })
    expect(preHarvestHold([], [label()])).toEqual({ clearFrom: null, unknown: 0 })
  })
})

describe('with the almond pack as it stands', () => {
  const almond = createPackContext(packSchema.parse(loadPackSource(join(__dirname, '../../packs/almond/0.1.1')).raw))
  const fruiting = { stage: 'nut-development', recordedAt: null, source: 'computed' }

  it('has no seasonal tasks yet, and says what each engine waits for', () => {
    const r = runBlockDay(input({ pack: almond, varietyId: 'vairo', recordedStage: fruiting }))
    for (const engine of ['pollination', 'canopy_pruning', 'weed_groundcover', 'harvest']) {
      expect(r.engines[engine].active).toBe(true)
      expect(plan(r, engine).due).toEqual([])
    }
    expect(r.engines.pollination.diagnosis?.notes).toEqual([
      'The variety is self-compatible: hives are optional or at reduced density',
      '$hive_density_per_ha is still to be sourced, so no hive number is given',
    ])
    expect(r.engines.harvest.diagnosis?.notes).toEqual([
      '$harvest_shake_hull_split_pct is still to be sourced, so readiness cannot be judged',
      '$preharvest_irrigation_cutoff_days is still to be sourced, so no irrigation cut-off is set',
    ])
  })

  it('asks for the canopy measurement the irrigation engine needs', () => {
    const r = runBlockDay(input({ pack: almond, recordedStage: fruiting, canopy: { cover: null, heightM: null } }))
    expect(by(r, 'canopy_pruning')).toMatchObject([{ ruleId: 'CANOPY-NOT-MEASURED', actionType: 'canopy_measurement' }])
  })

  it('does not assess flight weather at bloom, as the pack gives no flight limits', () => {
    const r = runBlockDay(input({ pack: almond, varietyId: 'makako', recordedStage: { stage: 'bloom', recordedAt: null, source: 'manual' } }))
    expect(r.engines.pollination.diagnosis?.notes).toContain('Flight weather is not assessed: the pack gives no limits for pollinator flight')
  })
})
