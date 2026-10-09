import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { createPackContext } from '../pack/context'
import { loadPackSource } from '../pack/load'
import { packSchema } from '../pack/schema'
import { confidenceFromFlags } from './action'
import { demoContext } from './__fixtures__/demo-pack'
import { frostNights, resolveKcb, runBlockDay, type BlockDayInput, type CarriedWaterState } from './run-block'
import { addDays, aggregateDaily, dayOfYear, daysBetween, type HourlyWeatherPoint } from './weather'

const TODAY = '2026-05-10'

interface DayShape {
  tmin?: number
  tmax?: number
  rain?: number
  rainProb?: number
}

/** 24 hours per day from `start`; days from `forecastFrom` on are forecasts. */
function hours(start: string, shapes: DayShape[], forecastFrom: string): HourlyWeatherPoint[] {
  return shapes.flatMap((shape, i) => {
    const localDate = addDays(start, i)
    const tmin = shape.tmin ?? 10
    const tmax = shape.tmax ?? 24
    return Array.from({ length: 24 }, (_, h) => ({
      localDate,
      localHour: h,
      tempC: (tmin + tmax) / 2 + ((tmax - tmin) / 2) * Math.cos((2 * Math.PI * (h - 15)) / 24),
      rhPct: 70 - 30 * Math.cos((2 * Math.PI * (h - 15)) / 24),
      wind10mMs: 2.7,
      shortwaveWm2: h >= 6 && h <= 18 ? 500 * Math.sin((Math.PI * (h - 6)) / 12) : 0,
      precipMm: h === 3 ? shape.rain ?? 0 : 0,
      precipProbPct: localDate >= forecastFrom ? shape.rainProb ?? 0 : null,
      forecast: localDate >= forecastFrom,
    }))
  })
}

/** Seven past days and four forecast days around TODAY. */
const weather = (future: DayShape[] = [{}, {}, {}, {}], past: DayShape[] = Array.from({ length: 7 }, () => ({}))) =>
  hours(addDays(TODAY, -past.length), [...past, ...future], TODAY)

function input(over: Partial<BlockDayInput> = {}): BlockDayInput {
  return {
    today: TODAY,
    blockId: 'B1',
    pack: demoContext(),
    varietyId: 'plain',
    recordedStage: { stage: 'leafy', recordedAt: '2026-05-01T00:00:00Z', source: 'manual' },
    soil: { thetaFC: 0.3, thetaWP: 0.15, rootDepthM: 1, zeM: 0.1, rewMm: 8, evaporationDefaults: true },
    canopy: { cover: 0.5, heightM: 3 },
    wettedFraction: 0.4,
    areaHa: 2,
    site: { latitudeDeg: 38.2, elevationM: 950 },
    settings: { irrigationEfficiency: 0.9, frostMarginC: 2, switches: {} },
    weather: weather(),
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

const dry = (through: string, Dr: number): CarriedWaterState => ({
  through,
  Dr,
  De: 22.5,
  fw: 0.4,
  etcSinceIrrigation: 40,
  gapsMm: [],
  initialAssumed: false,
  last: { et0: 5, etc: 4.5, raw: 75, taw: 150, ks: 1 },
})

describe('weather helpers', () => {
  it('aggregates hours into the daily inputs', () => {
    const [d] = aggregateDaily(hours('2026-05-01', [{ tmin: 8, tmax: 22, rain: 6, rainProb: 80 }], '2026-05-01'))
    expect(d.tmax).toBeCloseTo(22, 6)
    expect(d.tmin).toBeCloseTo(8, 6)
    expect(d.rainMm).toBe(6)
    expect(d.rainProb).toBe(0.8)
    expect(d.complete).toBe(true)
    expect(d.forecast).toBe(true)
    // 2.7 m/s at 10 m is about 2.0 m/s at 2 m (FAO-56 Eq. 47).
    expect(d.wind2m).toBeCloseTo(2.02, 2)
    expect(d.rsMj).toBeGreaterThan(10)
  })

  it('marks a day with missing hours as incomplete', () => {
    const partial = hours('2026-05-01', [{}], '2026-06-01').slice(0, 20)
    expect(aggregateDaily(partial)[0].complete).toBe(false)
  })

  it('does date arithmetic', () => {
    expect(dayOfYear('2026-01-01')).toBe(1)
    expect(dayOfYear('2026-07-06')).toBe(187)
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(daysBetween('2026-05-10', '2026-05-13')).toBe(3)
  })

  it('finds the coldest forecast temperature of each coming night', () => {
    const nights = frostNights(weather([{ tmin: 4 }, { tmin: -1 }, { tmin: 2 }, { tmin: 6 }]), TODAY)
    expect(nights.map(n => [n.dayIndex, Math.round(n.minC)])).toEqual([[0, 4], [1, -1], [2, 2], [3, 6]])
  })
})

describe('water balance across days', () => {
  it('starts from an assumed full profile on the first run and says so', () => {
    const r = runBlockDay(input())
    expect(r.carried?.through).toBe(addDays(TODAY, -1))
    expect(r.state.water_balance_days_advanced).toBe(7)
    expect(r.state.Dr as number).toBeGreaterThan(10)
    expect(r.state.flags).toContain('INITIAL_DEPLETION_ASSUMED')
    expect(r.state.flags).toContain('WEATHER_MODELLED')
    expect(r.state.flags).toContain('SOIL_EVAPORATION_DEFAULTS')
  })

  it('advances exactly the new days from the carried balance', () => {
    const first = runBlockDay(input())
    const nextDay = addDays(TODAY, 1)
    const second = runBlockDay(input({ today: nextDay, carried: first.carried, weather: hours(addDays(TODAY, -6), Array.from({ length: 11 }, () => ({})), nextDay) }))
    expect(second.state.water_balance_days_advanced).toBe(1)
    expect(second.carried?.through).toBe(TODAY)
    expect(second.carried!.Dr).toBeGreaterThan(first.carried!.Dr)
  })

  it('changes nothing on a second run the same day', () => {
    const first = runBlockDay(input())
    const again = runBlockDay(input({ carried: first.carried }))
    expect(again.state.water_balance_days_advanced).toBe(0)
    expect(again.carried).toEqual(first.carried)
    expect(again.state.Dr).toBe(first.state.Dr)
  })

  it('starts again when there is a hole between the carried balance and the weather', () => {
    const r = runBlockDay(input({ carried: dry(addDays(TODAY, -30), 90) }))
    expect(r.state.water_balance_days_advanced).toBe(7)
    expect(r.state.flags).toContain('INITIAL_DEPLETION_ASSUMED')
  })

  it('counts an irrigation and restarts the ETc total from it', () => {
    const start = dry(addDays(TODAY, -8), 90)
    const none = runBlockDay(input({ carried: start }))
    const watered = runBlockDay(input({ carried: start, irrigationMmByDate: { [addDays(TODAY, -3)]: 40 } }))
    expect(watered.carried!.Dr).toBeLessThan(none.carried!.Dr - 30)
    expect(watered.carried!.etcSinceIrrigation).toBeLessThan(none.carried!.etcSinceIrrigation)
  })

  it('replaces the modelled depletion with a validated soil reading', () => {
    const r = runBlockDay(input({ measuredTheta: { value: 0.24, at: `${addDays(TODAY, -1)}T18:00:00Z` } }))
    expect(r.state.Dr).toBeCloseTo(60, 6)
    expect(r.state.flags).not.toContain('INITIAL_DEPLETION_ASSUMED')
    expect(r.carried!.gapsMm).toHaveLength(1)
  })

  it('clears the assumed start once rain refills the profile', () => {
    const wet = Array.from({ length: 7 }, (_, i) => (i === 5 ? { rain: 120 } : {}))
    expect(runBlockDay(input({ weather: weather(undefined, wet) })).state.flags).not.toContain('INITIAL_DEPLETION_ASSUMED')
  })

  it('does not compute a balance without the block data it needs, and lists what is missing', () => {
    const r = runBlockDay(input({ canopy: { cover: null, heightM: null }, soil: { ...input().soil, thetaFC: null } }))
    expect(r.carried).toBeNull()
    expect(r.state.Dr).toBeUndefined()
    expect(r.state.water_balance_missing).toEqual([
      'field capacity and wilting point of the block',
      'canopy cover of the block',
      'canopy height of the block',
    ])
  })

  it('uses the pack root depth when the block has none', () => {
    const r = runBlockDay(input({ soil: { ...input().soil, rootDepthM: null } }))
    expect(r.state.TAW).toBeCloseTo(150, 6)
  })
})

describe('irrigation engine', () => {
  it('holds while depletion is below the readily available water', () => {
    const r = runBlockDay(input())
    expect(r.engines.irrigation.diagnosis).toMatchObject({ ruleId: 'D-4', outcome: 'hold' })
    expect(r.actions.filter(a => a.engineId === 'irrigation')).toEqual([])
  })

  it('proposes a refill once depletion reaches it, with the rule, inputs and pack version', () => {
    const r = runBlockDay(input({ carried: dry(addDays(TODAY, -1), 90) }))
    const [a] = r.actions.filter(x => x.engineId === 'irrigation')
    expect(a).toMatchObject({ ruleId: 'D-3', actionType: 'irrigate', packId: 'demo', packVersion: '1.0.0', unit: 'mm', quantity: 100, evidence: 'SRC', mandatory: false })
    expect(a.waterM3).toBe(2000)
    expect(a.inputsSnapshot).toMatchObject({ phase: 'growing', Dr: 90, RAW: 75, efficiency: 0.9, leaching_fraction: 0 })
    expect(a.flags).toEqual(expect.arrayContaining(['WEATHER_MODELLED', 'LEACHING_NOT_ASSESSED', 'VALUE_NOT_ESTIMATED']))
    expect(a.confidence).toBeLessThan(1)
  })

  it('defers when forecast rain is expected to refill the root zone', () => {
    const r = runBlockDay(input({ carried: dry(addDays(TODAY, -1), 20), weather: weather([{ rain: 30, rainProb: 90 }, {}, {}, {}]) }))
    expect(r.engines.irrigation.diagnosis).toMatchObject({ ruleId: 'D-1', outcome: 'defer' })
    expect(r.actions.filter(a => a.engineId === 'irrigation')).toEqual([])
  })

  it('applies a deficit strategy only when the farm switched it on', () => {
    const off = runBlockDay(input({ carried: dry(addDays(TODAY, -1), 20) }))
    expect(off.engines.irrigation.diagnosis?.ruleId).toBe('D-4')
    const on = runBlockDay(input({ carried: dry(addDays(TODAY, -1), 20), settings: { ...input().settings, switches: { deficit_enabled: true } } }))
    const [a] = on.actions.filter(x => x.engineId === 'irrigation')
    expect(a).toMatchObject({ ruleId: 'D-2', actionType: 'irrigate_partial', quantity: 20 })
  })

  it('decides from the phase alone when the phase rules out irrigation', () => {
    const r = runBlockDay(input({ recordedStage: { stage: 'asleep', recordedAt: null, source: null }, canopy: { cover: null, heightM: null } }))
    expect(r.engines.irrigation.diagnosis).toMatchObject({ ruleId: 'D-0', outcome: 'none' })
  })

  it('does not report "hold" when it could not compute depletion', () => {
    const r = runBlockDay(input({ canopy: { cover: null, heightM: null } }))
    const d = r.engines.irrigation.diagnosis!
    expect(d.ruleId).toBeNull()
    expect(d.outcome).toBeNull()
    expect(d.notes.join(' ')).toMatch(/Cannot decide without: .*Dr/)
    expect(d.notes.join(' ')).toMatch(/canopy cover of the block/)
    expect(r.actions.filter(a => a.engineId === 'irrigation')).toEqual([])
  })

  it('lowers confidence once for each weak input', () => {
    expect(confidenceFromFlags([])).toBe(1)
    expect(confidenceFromFlags(['WEATHER_MODELLED', 'VALUE_NOT_ESTIMATED'])).toBe(0.9)
    expect(confidenceFromFlags(['WEATHER_MODELLED', 'INITIAL_DEPLETION_ASSUMED', 'RULES_SKIPPED'])).toBe(0.7)
  })
})

describe('frost engine', () => {
  const flowering = { stage: 'flowers', recordedAt: null, source: 'manual' }

  it('is not assessed outside the phases the pack names', () => {
    const r = runBlockDay(input({ weather: weather([{}, { tmin: -6 }, {}, {}]) }))
    expect(r.engines.frost.diagnosis?.notes[0]).toMatch(/not assessed in the growing phase/)
    expect(r.actions.filter(a => a.engineId === 'frost')).toEqual([])
  })

  it('proposes nothing when no night comes near the critical temperature', () => {
    const r = runBlockDay(input({ recordedStage: flowering }))
    expect(r.engines.frost.diagnosis?.outcome).toBe('none')
    expect(r.actions.filter(a => a.engineId === 'frost')).toEqual([])
  })

  it('asks for preparation on a watch', () => {
    const r = runBlockDay(input({ recordedStage: flowering, weather: weather([{}, {}, { tmin: 1.5 }, {}]) }))
    const [a] = r.actions.filter(x => x.engineId === 'frost')
    expect(a).toMatchObject({ ruleId: 'FROST-WATCH', actionType: 'frost_prepare', earliestDay: 0, latestDay: 1, mandatory: false })
  })

  it('schedules protection on a warning', () => {
    const r = runBlockDay(input({ recordedStage: flowering, weather: weather([{}, { tmin: -0.5 }, {}, {}]) }))
    const [a] = r.actions.filter(x => x.engineId === 'frost')
    expect(a).toMatchObject({ ruleId: 'FROST-WARNING', actionType: 'frost_protect', earliestDay: 1, latestDay: 1, mandatory: false })
  })

  it('makes protection mandatory at the critical temperature and asks for damage scouting', () => {
    const r = runBlockDay(input({ recordedStage: flowering, weather: weather([{}, { tmin: -3 }, {}, {}]) }))
    const frost = r.actions.filter(x => x.engineId === 'frost')
    expect(frost.map(a => [a.actionType, a.mandatory, a.earliestDay])).toEqual([
      ['frost_protect', true, 1],
      ['frost_damage_scouting', false, 2],
    ])
    expect(frost[0].inputsSnapshot).toMatchObject({ frost_stage: 'open_flowers', critical_c: -2, night: addDays(TODAY, 1) })
    expect(r.engines.frost.diagnosis).toMatchObject({ ruleId: 'FROST-CRITICAL', outcome: 'critical' })
  })

  it('uses the variety levels when the pack has them, with an interpolated damage fraction', () => {
    const r = runBlockDay(input({ recordedStage: flowering, varietyId: 'hardy', weather: weather([{}, { tmin: -4 }, {}, {}]) }))
    const [a] = r.actions.filter(x => x.engineId === 'frost')
    expect(a.inputsSnapshot.critical_c).toBe(-3)
    expect(a.inputsSnapshot.damage_fraction).toBeCloseTo(0.5, 6)
  })

  it('is inactive for a crop whose pack has no frost section', () => {
    const pack = demoContext(raw => delete (raw as { frost?: unknown }).frost)
    const r = runBlockDay(input({ pack, recordedStage: flowering }))
    expect(r.engines.frost).toMatchObject({ active: false, diagnosis: null })
    expect(r.engines.frost.reason).toMatch(/has no frost\.stages, so the frost engine is inactive/)
  })
})

describe('phenology engine', () => {
  it('publishes the phase of the recorded stage', () => {
    const r = runBlockDay(input())
    expect(r.state.phase).toBe('growing')
    expect(r.engines.phenology.diagnosis?.outcome).toBe('growing')
  })

  it('asks for the growth stage when none is recorded', () => {
    const r = runBlockDay(input({ recordedStage: null }))
    expect(r.state.phase).toBeNull()
    expect(r.actions.filter(a => a.engineId === 'phenology')).toMatchObject([{ ruleId: 'PHEN-STAGE-MISSING', actionType: 'observe' }])
  })

  it('reports a recorded stage the pack does not know, without asking for scouting', () => {
    const r = runBlockDay(input({ recordedStage: { stage: 'mystery', recordedAt: null, source: null } }))
    expect(r.engines.phenology.diagnosis).toMatchObject({ ruleId: 'PHEN-STAGE-NOT-IN-PACK' })
    expect(r.actions.filter(a => a.engineId === 'phenology')).toEqual([])
  })
})

describe('Kcb from the pack', () => {
  it('reads the curve value for the phase', () => {
    expect(resolveKcb(demoContext(), 'growing', { cover: null, heightM: null }, { wind2m: 2, rhMin: 45 })).toEqual({ value: 0.9 })
  })

  it('uses a farm-calibrated value inside the pack bounds', () => {
    expect(resolveKcb(demoContext(undefined, { kcb_growing: 1.0 }), 'growing', { cover: null, heightM: null }, { wind2m: 2, rhMin: 45 })).toEqual({ value: 1 })
  })

  it('says what is missing for a phase without a value', () => {
    expect(resolveKcb(demoContext(), 'elsewhere', { cover: 0.5, heightM: 3 }, { wind2m: 2, rhMin: 45 })).toEqual({ missing: ['a crop coefficient for the elsewhere phase'] })
  })
})

describe('with the almond pack as it stands', () => {
  const almond = createPackContext(packSchema.parse(loadPackSource(join(__dirname, '../../packs/almond/0.1.0')).raw))

  it('cannot schedule irrigation until the crop-coefficient values are sourced, and says which', () => {
    const r = runBlockDay(input({ pack: almond, varietyId: 'vairo', recordedStage: { stage: 'nut-development', recordedAt: null, source: 'computed' } }))
    expect(r.state.phase).toBe('fruit_growth')
    expect(r.carried).toBeNull()
    expect(r.state.water_balance_missing).toEqual(['$kcb_ml (to be sourced)', '$kcb_fr (to be sourced)', '$kc_min (to be sourced)'])
    expect(r.engines.irrigation.diagnosis?.ruleId).toBeNull()
    expect(r.actions.filter(a => a.engineId === 'irrigation')).toEqual([])
  })

  it('takes no irrigation action in dormancy', () => {
    const r = runBlockDay(input({ pack: almond, recordedStage: { stage: 'dormancy', recordedAt: null, source: 'computed' } }))
    expect(r.engines.irrigation.diagnosis).toMatchObject({ ruleId: 'ALM-IRR-00', outcome: 'none' })
  })

  it('assesses frost at bloom with the measured levels for the bound variety', () => {
    const r = runBlockDay(input({ pack: almond, varietyId: 'vairo', recordedStage: { stage: 'bloom', recordedAt: null, source: 'manual' }, weather: weather([{}, { tmin: -4 }, {}, {}]) }))
    const [a] = r.actions.filter(x => x.engineId === 'frost')
    expect(a).toMatchObject({ ruleId: 'FROST-CRITICAL', mandatory: true, evidence: 'CALLE2025' })
    expect(a.inputsSnapshot.critical_c).toBe(-3.46)
    expect(a.inputsSnapshot.damage_fraction).toBeCloseTo(0.2554, 3)
  })

  it('has no phase for a block at bud break', () => {
    const r = runBlockDay(input({ pack: almond, recordedStage: { stage: 'bud-break', recordedAt: null, source: 'computed' } }))
    expect(r.state.phase).toBeNull()
    expect(r.engines.phenology.diagnosis?.ruleId).toBe('PHEN-STAGE-NOT-IN-PACK')
  })
})
