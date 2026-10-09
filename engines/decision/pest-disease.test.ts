import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { createPackContext } from '../pack/context'
import { loadPackSource } from '../pack/load'
import { packSchema } from '../pack/schema'
import { breaksRotation, checkProduct, reentryStatus, type ProductLabel, type SprayApplication, type SprayContext } from '../safeguards/spray'
import { demoContext } from './__fixtures__/demo-pack'
import type { DiseaseState } from './disease'
import { derive, type CarriedModels, type FieldObservation } from './field-data'
import type { PestState } from './insect-pest'
import { runBlockDay, type BlockDayInput } from './run-block'
import { addDays, type HourlyWeatherPoint } from './weather'

const TODAY = '2026-05-10'

interface HourShape {
  wind10mMs?: number
  precipMm?: number
  leafWet?: boolean | null
}

/** Hourly weather from `daysBack` days before `today` to three days after; `shape` sets each hour. */
function weather(today = TODAY, shape: (date: string, hour: number) => HourShape = () => ({}), daysBack = 7): HourlyWeatherPoint[] {
  return Array.from({ length: daysBack + 4 }, (_, i) => addDays(today, i - daysBack)).flatMap(localDate =>
    Array.from({ length: 24 }, (_, h) => {
      const s = shape(localDate, h)
      return {
        localDate,
        localHour: h,
        // Minimum 10, maximum 24: 7 degree-days a day above a lower threshold of 10 degC.
        tempC: 17 + 7 * Math.cos((2 * Math.PI * (h - 15)) / 24),
        rhPct: 60,
        wind10mMs: s.wind10mMs ?? 2.7,
        shortwaveWm2: h >= 6 && h <= 18 ? 500 * Math.sin((Math.PI * (h - 6)) / 12) : 0,
        precipMm: s.precipMm ?? 0,
        precipProbPct: localDate >= today ? 0 : null,
        forecast: localDate >= today,
        leafWet: s.leafWet,
      }
    }),
  )
}

const label = (over: Partial<ProductLabel> = {}): ProductLabel => ({
  id: 'P1',
  name: 'Product one',
  targets: ['grub', 'spot', 'blight', 'now', 'red_leaf_blotch'],
  modeOfActionGroup: '11',
  maxWindMs: 4,
  minWindMs: 0.5,
  rainfastHours: 6,
  phiDays: 14,
  reiHours: 24,
  maxApplicationsPerSeason: 2,
  beeToxic: false,
  registered: true,
  approved: true,
  ...over,
})

const spray = (daysAgo: number, over: Partial<SprayApplication> = {}): SprayApplication => ({
  date: addDays(TODAY, -daysAgo),
  at: `${addDays(TODAY, -daysAgo)}T08:00:00Z`,
  productId: 'P1',
  targetId: 'spot',
  ...over,
})

const ctx = (over: Partial<SprayContext> = {}): SprayContext => ({
  today: TODAY,
  hours: weather(),
  horizonDays: 4,
  workingHours: [6, 19],
  plannedHarvestDate: null,
  applications: [],
  hivesPresent: null,
  inBeePhase: false,
  ...over,
})

const ids = (findings: { safeguardId: string }[]) => findings.map(f => f.safeguardId)

describe('spray safeguards', () => {
  it('passes a complete, approved product in workable weather', () => {
    const r = checkProduct(label(), ctx())
    expect(r.blocked).toEqual([])
    expect(r.usable).toBe(true)
    // On the last forecast day only the hours up to 17:00 still have six forecast hours after them.
    expect(r.days.map(d => d.allowedHours.length)).toEqual([14, 14, 14, 12])
  })

  it('SG-SPR-1: closes every day when forecast wind is above the label maximum', () => {
    const r = checkProduct(label(), ctx({ hours: weather(TODAY, () => ({ wind10mMs: 9 })) }))
    expect(r.usable).toBe(false)
    expect(r.days.every(d => ids(d.vetoes).includes('SG-SPR-1'))).toBe(true)
  })

  it('SG-SPR-2: closes calm hours, and the day when every hour is calm', () => {
    const calmAtDawn = checkProduct(label(), ctx({ hours: weather(TODAY, (_, h) => ({ wind10mMs: h < 9 ? 0.2 : 2.7 })) }))
    expect(calmAtDawn.days[0].allowedHours).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
    const calm = checkProduct(label(), ctx({ hours: weather(TODAY, () => ({ wind10mMs: 0.2 })) }))
    expect(calm.days.every(d => ids(d.vetoes).includes('SG-SPR-2'))).toBe(true)
  })

  it('SG-SPR-3: closes the hours before forecast rain inside the rainfast period', () => {
    const tomorrow = addDays(TODAY, 1)
    const r = checkProduct(label(), ctx({ hours: weather(TODAY, (date, h) => ({ precipMm: date === tomorrow && h === 14 ? 3 : 0 })) }))
    // Rain at 14:00 tomorrow: with 6 h to rainfast, nothing from 08:00 to 14:00 is allowed.
    expect(r.days[1].allowedHours).toEqual([6, 7, 15, 16, 17, 18, 19])
    const wet = checkProduct(label(), ctx({ hours: weather(TODAY, () => ({ precipMm: 1 })) }))
    expect(wet.days.every(d => ids(d.vetoes).includes('SG-SPR-3'))).toBe(true)
  })

  it('SG-SPR-3: does not allow an hour whose rainfast period the forecast does not cover', () => {
    const r = checkProduct(label({ rainfastHours: 48 }), ctx())
    expect(r.days[3].vetoes.map(v => v.reason)).toEqual(['The forecast does not cover the rainfast period'])
  })

  it('SG-SPR-4: vetoes every day when the pre-harvest interval runs past the planned harvest', () => {
    const r = checkProduct(label({ phiDays: 30 }), ctx({ plannedHarvestDate: addDays(TODAY, 10) }))
    expect(r.usable).toBe(false)
    expect(r.days.map(d => ids(d.vetoes))).toEqual([['SG-SPR-4'], ['SG-SPR-4'], ['SG-SPR-4'], ['SG-SPR-4']])
  })

  it('SG-SPR-4: allows a spray whose interval ends before harvest, and notes an unknown harvest date', () => {
    expect(checkProduct(label(), ctx({ plannedHarvestDate: addDays(TODAY, 40) })).usable).toBe(true)
    expect(checkProduct(label(), ctx()).notes).toEqual(['No planned harvest date, so the pre-harvest interval could not be checked'])
  })

  it('SG-SPR-6: blocks a product at its maximum applications per season', () => {
    const r = checkProduct(label(), ctx({ applications: [spray(30), spray(15)] }))
    expect(r.blocked).toEqual([{ safeguardId: 'SG-SPR-6', reason: 'Applied 2 time(s) this season; the label maximum is 2' }])
  })

  it('SG-SPR-6: blocks when spray entries do not name their product, since the count cannot be confirmed', () => {
    expect(ids(checkProduct(label(), ctx({ applications: [spray(30, { productId: null })] })).blocked)).toEqual(['SG-SPR-6'])
  })

  it('SG-SPR-7: blocks a product that is not registered, or whose registration is not recorded', () => {
    expect(ids(checkProduct(label({ registered: false }), ctx()).blocked)).toEqual(['SG-SPR-7'])
    expect(ids(checkProduct(label({ registered: null }), ctx()).blocked)).toEqual(['SG-SPR-7'])
  })

  it('SG-SPR-8: vetoes a bee-toxic product while hives are recorded in the block', () => {
    expect(ids(checkProduct(label({ beeToxic: true }), ctx({ hivesPresent: true })).blocked)).toEqual(['SG-SPR-8'])
  })

  it('SG-SPR-8: vetoes a bee-toxic product in a bee-protection phase, and allows it otherwise', () => {
    expect(ids(checkProduct(label({ beeToxic: true }), ctx({ inBeePhase: true })).blocked)).toEqual(['SG-SPR-8'])
    expect(checkProduct(label({ beeToxic: true }), ctx({ hivesPresent: false })).usable).toBe(true)
    expect(checkProduct(label({ beeToxic: false }), ctx({ hivesPresent: true, inBeePhase: true })).usable).toBe(true)
  })

  it('blocks a product for each label value that is missing, and invents none', () => {
    const r = checkProduct(
      label({ maxWindMs: null, minWindMs: null, rainfastHours: null, phiDays: null, maxApplicationsPerSeason: null, beeToxic: null }),
      ctx(),
    )
    expect(ids(r.blocked).sort()).toEqual(['SG-SPR-1', 'SG-SPR-2', 'SG-SPR-3', 'SG-SPR-4', 'SG-SPR-6', 'SG-SPR-8'])
    expect(r.days).toEqual([])
    expect(r.usable).toBe(false)
  })

  it('blocks a product that is not approved in the library', () => {
    expect(ids(checkProduct(label({ approved: false }), ctx()).blocked)).toEqual(['LIBRARY'])
  })

  it('SG-SPR-5: keeps labour out of the block until the re-entry interval has passed', () => {
    const now = new Date(`${TODAY}T10:00:00Z`)
    expect(reentryStatus([spray(0)], [label()], now)).toEqual({ blockedUntil: `${addDays(TODAY, 1)}T08:00:00.000Z`, unknown: 0 })
    expect(reentryStatus([spray(3)], [label()], now).blockedUntil).toBeNull()
    expect(reentryStatus([spray(0, { productId: null })], [label()], now)).toEqual({ blockedUntil: null, unknown: 1 })
  })

  it('resistance rotation: a group used on the last treatments in a row is not used again', () => {
    const labels = [label(), label({ id: 'P2', modeOfActionGroup: '3' })]
    const twice = [spray(20), spray(10)]
    expect(breaksRotation(labels[0], 'spot', twice, labels, 2)).toBe(true)
    expect(breaksRotation(labels[1], 'spot', twice, labels, 2)).toBe(false)
    expect(breaksRotation(labels[0], 'spot', [spray(20, { productId: 'P2' }), spray(10)], labels, 2)).toBe(false)
    expect(breaksRotation(labels[0], 'spot', [spray(10)], labels, 2)).toBe(false)
  })
})

describe('values derived from observations', () => {
  const check = (day: number, values: Record<string, unknown>): FieldObservation => ({ kind: 'trap_check', subject: 'grub', observedOn: `2026-05-0${day}`, values })

  it('counts checks in a row that rose, and dates the first of them', () => {
    const series = [check(1, { count: 5 }), check(3, { count: 2 }), check(5, { count: 4 }), check(7, { count: 9 })]
    expect(derive({ key: 'k', stat: 'rising_run', observation: 'trap_check', field: 'count' }, series)).toEqual({ value: 2, latestDate: '2026-05-07', runStartDate: '2026-05-05' })
    expect(derive({ key: 'k', stat: 'rising_run', observation: 'trap_check', field: 'count' }, series.slice(0, 2)).value).toBe(0)
  })

  it('takes the latest value and the latest ratio', () => {
    const series = [check(1, { traps_with: 1, traps: 4 }), check(3, { traps_with: 3, traps: 4 })]
    expect(derive({ key: 'k', stat: 'latest', observation: 'trap_check', field: 'traps_with' }, series).value).toBe(3)
    expect(derive({ key: 'k', stat: 'latest_ratio', observation: 'trap_check', field: 'traps_with', over: 'traps' }, series).value).toBe(0.75)
  })

  it('has no value without observations', () => {
    expect(derive({ key: 'k', stat: 'latest', observation: 'trap_check', field: 'count' }, []).value).toBeNull()
  })
})

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

const trap = (daysAgo: number, values: Record<string, unknown>, subject = 'grub'): FieldObservation => ({ kind: 'trap_check', subject, observedOn: addDays(TODAY, -daysAgo), values })
const by = (r: ReturnType<typeof runBlockDay>, engine: string) => r.actions.filter(a => a.engineId === engine)
const pest = (r: ReturnType<typeof runBlockDay>, id = 'grub') => (r.state.pests as Record<string, PestState>)[id]
const disease = (r: ReturnType<typeof runBlockDay>, id: string) => (r.state.diseases as Record<string, DiseaseState>)[id]
const models = (pests: CarriedModels['pests'] = {}, diseases: CarriedModels['diseases'] = {}): CarriedModels => ({ pests, diseases })

describe('insect pest engine', () => {
  it('asks for monitoring before biofix, once and not again the next day', () => {
    const first = runBlockDay(input())
    expect(by(first, 'insect_pest')).toMatchObject([{ ruleId: 'G-2', actionType: 'monitor_grub', description: 'Demo grub: Check traps weekly' }])
    expect(first.carriedModels.pests.grub).toMatchObject({ season: 2026, biofix: null, lastRule: 'G-2' })

    const next = runBlockDay(input({ field: { carriedModels: first.carriedModels } }))
    expect(pest(next).ruleId).toBe('G-2')
    expect(by(next, 'insect_pest')).toEqual([])
  })

  it('sets the biofix at the first of the rising checks', () => {
    const r = runBlockDay(input({ field: { observations: [trap(6, { count: 1 }), trap(4, { count: 3 }), trap(2, { count: 6 })] } }))
    expect(pest(r)).toMatchObject({ biofix: addDays(TODAY, -4), biofixSource: 'rule' })
    // Four complete days from the biofix date to yesterday, 7 degree-days each.
    expect(pest(r).dd).toBeCloseTo(28, 6)
    expect(pest(r).ddThrough).toBe(addDays(TODAY, -1))
  })

  it('sets the biofix at the check date when enough traps have a catch', () => {
    const r = runBlockDay(input({ field: { observations: [trap(3, { count: 2, traps: 4, traps_with: 3 })] } }))
    expect(pest(r)).toMatchObject({ biofix: addDays(TODAY, -3), biofixSource: 'rule' })
    expect(pest(r).notes[0]).toMatch(/Biofix set to .* by rule G-1b/)
  })

  it('lets an observed biofix override the rule', () => {
    const observations = [trap(6, { count: 1 }), trap(4, { count: 3 }), trap(2, { count: 6 }), { kind: 'biofix', subject: 'grub', observedOn: addDays(TODAY, -2), values: {} }]
    const r = runBlockDay(input({ field: { observations } }))
    expect(pest(r)).toMatchObject({ biofix: addDays(TODAY, -2), biofixSource: 'observed' })
    expect(pest(r).dd).toBeCloseTo(14, 6)
  })

  it('carries the degree-days forward one day at a time', () => {
    const carriedModels = models({ grub: { season: 2026, biofix: addDays(TODAY, -20), biofixSource: 'rule', dd: 100, through: addDays(TODAY, -3), lastRule: 'G-5' } })
    const r = runBlockDay(input({ field: { carriedModels } }))
    expect(pest(r).dd).toBeCloseTo(114, 6)
    const again = runBlockDay(input({ field: { carriedModels: r.carriedModels } }))
    expect(pest(again).dd).toBeCloseTo(114, 6)
  })

  it('prepares as the event approaches', () => {
    const carriedModels = models({ grub: { season: 2026, biofix: addDays(TODAY, -30), biofixSource: 'rule', dd: 150, through: addDays(TODAY, -2), lastRule: 'G-5' } })
    const r = runBlockDay(input({ field: { carriedModels } }))
    expect(by(r, 'insect_pest')).toMatchObject([{ ruleId: 'G-4', actionType: 'prepare_grub' }])
  })

  it('proposes a treatment at the event, with the library products and their safeguard findings', () => {
    const carriedModels = models({ grub: { season: 2026, biofix: addDays(TODAY, -40), biofixSource: 'rule', dd: 198, through: addDays(TODAY, -2), lastRule: 'G-4' } })
    const observations: FieldObservation[] = [{ kind: 'ripeness', subject: null, observedOn: addDays(TODAY, -1), values: { pct: 5 } }]
    const r = runBlockDay(input({ field: { carriedModels, observations, products: [label(), label({ id: 'P2', name: 'Unregistered', registered: false })] } }))
    const [a] = by(r, 'insect_pest')
    expect(a).toMatchObject({ ruleId: 'G-3', actionType: 'spray_grub', unit: 'spray application', earliestDay: 0, latestDay: 3, evidence: 'SRC' })
    const safeguards = a.inputsSnapshot.spray_safeguards as { products: { productId: string; usable: boolean; blocked: { safeguardId: string }[] }[]; openDays: number[] }
    expect(safeguards.openDays).toEqual([0, 1, 2, 3])
    expect(safeguards.products.map(p => [p.productId, p.usable, ids(p.blocked)])).toEqual([
      ['P1', true, []],
      ['P2', false, ['SG-SPR-7']],
    ])
    expect(a.inputsSnapshot).toMatchObject({ pest: 'grub', degree_days: 205, dd_C: 205, ripeness: 5 })
  })

  it('still proposes the treatment when the library has no product for the pest, and says so', () => {
    const carriedModels = models({ grub: { season: 2026, biofix: addDays(TODAY, -40), biofixSource: 'rule', dd: 198, through: addDays(TODAY, -2), lastRule: 'G-3' } })
    const observations: FieldObservation[] = [{ kind: 'ripeness', subject: null, observedOn: addDays(TODAY, -1), values: { pct: 5 } }]
    const [a] = by(runBlockDay(input({ field: { carriedModels, observations } })), 'insect_pest')
    expect(a.description).toMatch(/The product library has no product listed against this target/)
  })

  it('starts again in a new season', () => {
    const carriedModels = models({ grub: { season: 2025, biofix: '2025-04-01', biofixSource: 'rule', dd: 900, through: '2025-09-30', lastRule: 'G-3' } })
    const r = runBlockDay(input({ field: { carriedModels } }))
    expect(pest(r)).toMatchObject({ biofix: null, dd: null, ruleId: 'G-2' })
  })

  it('says so when it has no weather back to the biofix', () => {
    const r = runBlockDay(input({ field: { observations: [{ kind: 'biofix', subject: 'grub', observedOn: addDays(TODAY, -30), values: {} }] } }))
    expect(pest(r).dd).toBeNull()
    expect(pest(r).notes.join(' ')).toMatch(/Degree-days cannot be accumulated: no weather on hand from/)
  })
})

describe('disease engine', () => {
  const petalFall = (daysAgo: number) => ({ petal_fall: addDays(TODAY, -daysAgo) })

  it('proposes each timed treatment as its window comes up', () => {
    const r = runBlockDay(input({ field: { events: petalFall(12), products: [label()] } }))
    expect(disease(r, 'spot')).toMatchObject({ active: true, ruleId: 'spot:TIMING' })
    const [a] = by(r, 'disease')
    // The second window runs from day 14 to day 21 after petal fall: 2 to 9 days from today.
    expect(a).toMatchObject({ ruleId: 'spot:TIMING', actionType: 'spray_spot', earliestDay: 2, latestDay: 3 })
    expect(a.description).toMatch(/Two to three weeks later/)
    expect(disease(r, 'spot').notes).toEqual(['Passed without a recorded treatment: At petal fall'])
  })

  it('does not propose a window that already has a treatment against the disease', () => {
    const r = runBlockDay(input({ field: { events: petalFall(16), products: [label()], applications: [spray(1)] } }))
    expect(disease(r, 'spot').ruleId).toBeNull()
    expect(by(r, 'disease')).toEqual([])
  })

  it('waits for the anchor date', () => {
    const r = runBlockDay(input())
    expect(disease(r, 'spot')).toMatchObject({ active: false, notes: ['No petal_fall date recorded this season'] })
  })

  it('excludes a product whose mode-of-action group was used on the last treatments in a row', () => {
    const products = [label({ maxApplicationsPerSeason: 5 }), label({ id: 'P2', name: 'Other group', modeOfActionGroup: '3', maxApplicationsPerSeason: 5 })]
    const applications = [spray(30, { targetId: 'spot' }), spray(25, { targetId: 'spot' })]
    const [a] = by(runBlockDay(input({ field: { events: petalFall(16), products, applications } })), 'disease')
    const safeguards = a.inputsSnapshot.spray_safeguards as { products: { productId: string; usable: boolean; blocked: { safeguardId: string }[] }[] }
    expect(safeguards.products.map(p => [p.productId, p.usable, ids(p.blocked)])).toEqual([
      ['P1', false, ['RESISTANCE']],
      ['P2', true, []],
    ])
  })

  it('cannot run an infection model without leaf wetness, and says so', () => {
    const r = runBlockDay(input())
    expect(disease(r, 'blight')).toMatchObject({ active: false, notes: ['Needs hourly leaf wetness, which no data source provides yet'] })
  })

  it('accumulates infection values from leaf wetness and proposes a treatment at the threshold', () => {
    // Seven wet hours before the 11:00 evaluation each day: a value of 2 a day.
    const wet = weather(TODAY, (_, h) => ({ leafWet: h >= 2 && h <= 8 }))
    const r = runBlockDay(input({ weather: wet, field: { products: [label()] } }))
    expect(disease(r, 'blight')).toMatchObject({ active: true, threshold: 4, ruleId: 'blight:THRESHOLD' })
    expect(disease(r, 'blight').accumulated).toBeGreaterThanOrEqual(4)
    expect(by(r, 'disease').map(a => a.actionType)).toContain('spray_blight')
    expect(r.carriedModels.diseases.blight.dailyValues.length).toBeGreaterThan(3)
  })

  it('starts the infection count again after a treatment against the disease', () => {
    const wet = weather(TODAY, (_, h) => ({ leafWet: h >= 2 && h <= 8 }))
    const r = runBlockDay(input({ weather: wet, field: { products: [label()], applications: [spray(1, { targetId: 'blight' })] } }))
    expect(disease(r, 'blight').accumulated).toBeLessThan(4)
    expect(disease(r, 'blight').ruleId).toBeNull()
  })

  it('assesses an infection model only in its active phases', () => {
    const wet = weather(TODAY, (_, h) => ({ leafWet: h >= 2 && h <= 8 }))
    const r = runBlockDay(input({ weather: wet, recordedStage: { stage: 'asleep', recordedAt: null, source: null } }))
    expect(disease(r, 'blight')).toMatchObject({ active: false, notes: ['Not assessed in the resting phase'] })
  })

  it('publishes cultural advice for the other engines during the sensitive phase', () => {
    const r = runBlockDay(input())
    expect(r.state.disease_advisories).toEqual([{ disease: 'rot', text: 'A mild water deficit lowers the risk.', drivers: { Ks: 1 } }])
    const resting = runBlockDay(input({ recordedStage: { stage: 'asleep', recordedAt: null, source: null } }))
    expect(resting.state.disease_advisories).toEqual([])
  })

  it('vetoes a bee-toxic product in the phase the pack protects bees in', () => {
    const r = runBlockDay(input({ recordedStage: { stage: 'flowers', recordedAt: null, source: null }, field: { events: petalFall(16), products: [label({ beeToxic: true })] } }))
    const [a] = by(r, 'disease')
    const safeguards = a.inputsSnapshot.spray_safeguards as { products: { blocked: { safeguardId: string }[] }[]; openDays: number[] }
    expect(ids(safeguards.products[0].blocked)).toEqual(['SG-SPR-8'])
    expect(safeguards.openDays).toEqual([])
  })
})

describe('block state from spray records', () => {
  it('publishes the re-entry interval in force', () => {
    const r = runBlockDay(input({ nowIso: `${TODAY}T10:00:00Z`, field: { products: [label()], applications: [spray(0)] } }))
    expect(r.state.reentry_blocked_until).toBe(`${addDays(TODAY, 1)}T08:00:00.000Z`)
  })

  it('does not store the working data with the state', () => {
    const r = runBlockDay(input({ field: { products: [label()] } }))
    expect(Object.keys(r.state).filter(k => k.startsWith('_'))).toEqual([])
  })
})

describe('with the almond pack as it stands', () => {
  const almond = createPackContext(packSchema.parse(loadPackSource(join(__dirname, '../../packs/almond/0.1.0')).raw))
  const eggs = (daysAgo: number, count: number, withEggs: number): FieldObservation => ({ kind: 'trap_check', subject: 'now', observedOn: addDays(TODAY, -daysAgo), values: { eggs: count, traps_checked: 4, traps_with_eggs: withEggs } })
  const fruiting = { stage: 'nut-development', recordedAt: null, source: 'computed' }

  it('asks for egg-trap checks for navel orangeworm before biofix', () => {
    const r = runBlockDay(input({ pack: almond, recordedStage: fruiting }))
    expect(by(r, 'insect_pest')).toMatchObject([{ ruleId: 'ALM-NOW-02', actionType: 'monitor_now', evidence: 'UCIPM_NOW' }])
  })

  it('sets the navel orangeworm biofix from rising egg counts and accumulates degree-days in Fahrenheit', () => {
    const r = runBlockDay(input({ pack: almond, recordedStage: fruiting, field: { observations: [eggs(6, 1, 1), eggs(4, 4, 1), eggs(2, 9, 1)] } }))
    expect(pest(r, 'now')).toMatchObject({ biofix: addDays(TODAY, -4), biofixSource: 'rule', ddUnits: 'F', ruleId: 'ALM-NOW-06' })
    // Minimum 50 degF, maximum 75.2 degF against 55/94 degF: about 8.5 degree-days F a day for four days.
    expect(pest(r, 'now').dd).toBeGreaterThan(30)
    expect(pest(r, 'now').dd).toBeLessThan(38)
  })

  it('cannot judge the navel orangeworm spray on cost, so it only prepares, and says which rules it skipped', () => {
    const carriedModels = models({ now: { season: 2026, biofix: addDays(TODAY, -60), biofixSource: 'rule', dd: 1100, through: addDays(TODAY, -1), lastRule: 'ALM-NOW-06' } })
    const observations: FieldObservation[] = [{ kind: 'hull_split', subject: null, observedOn: addDays(TODAY, -1), values: { pct: 3 } }]
    const r = runBlockDay(input({ pack: almond, recordedStage: fruiting, field: { carriedModels, observations } }))
    const [a] = by(r, 'insect_pest')
    expect(a).toMatchObject({ ruleId: 'ALM-NOW-05', actionType: 'prepare_now' })
    expect(a.flags).toContain('RULES_SKIPPED')
    expect(pest(r, 'now').skipped).toEqual([{ ruleId: 'ALM-NOW-03', missing: ['expected_loss_avoided'] }])
  })

  it('tracks peach twig borer degree-days from an observed biofix but proposes nothing, as the pack has no table for it', () => {
    const r = runBlockDay(input({ pack: almond, recordedStage: fruiting, field: { observations: [{ kind: 'biofix', subject: 'ptb', observedOn: addDays(TODAY, -3), values: {} }] } }))
    expect(pest(r, 'ptb').dd).toBeGreaterThan(0)
    expect(pest(r, 'ptb').notes).toContain('The pack has no decision table for this pest, so nothing is proposed')
    expect(by(r, 'insect_pest').filter(a => a.actionType.endsWith('_ptb'))).toEqual([])
  })

  it('times the red leaf blotch programme from petal fall, without a rotation check until its limit is sourced', () => {
    const r = runBlockDay(input({ pack: almond, recordedStage: fruiting, field: { events: { petal_fall: addDays(TODAY, -16) }, products: [label()] } }))
    const [a] = by(r, 'disease')
    expect(a).toMatchObject({ ruleId: 'red_leaf_blotch:TIMING', actionType: 'spray_red_leaf_blotch', evidence: 'UCIPM_RLB' })
    expect(a.description).toMatch(/Rotation of mode-of-action groups is not checked: \$rlb_frac_max_consecutive is still to be sourced/)
  })

  it('cannot run the Alternaria model without leaf wetness', () => {
    const r = runBlockDay(input({ pack: almond, recordedStage: fruiting }))
    expect(disease(r, 'alternaria').notes).toEqual(['Needs hourly leaf wetness, which no data source provides yet'])
  })

  it('publishes the hull rot advice at hull split', () => {
    const r = runBlockDay(input({ pack: almond, recordedStage: { stage: 'hull-split', recordedAt: null, source: 'manual' } }))
    expect((r.state.disease_advisories as { disease: string }[]).map(a => a.disease)).toEqual(['hull_rot'])
  })

  it('vetoes a bee-toxic product at bloom', () => {
    const r = runBlockDay(input({ pack: almond, recordedStage: { stage: 'bloom', recordedAt: null, source: 'manual' }, field: { events: { petal_fall: addDays(TODAY, -16) }, products: [label({ beeToxic: true })] } }))
    const [a] = by(r, 'disease')
    const safeguards = a.inputsSnapshot.spray_safeguards as { products: { blocked: { safeguardId: string }[] }[] }
    expect(ids(safeguards.products[0].blocked)).toEqual(['SG-SPR-8'])
  })
})
