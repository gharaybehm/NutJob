import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { classifyTissue } from '../core/tissue'
import { applyDamage, updateYieldEstimate, yieldFractionAtAge, yieldFromComponents } from '../core/yield'
import { createPackContext } from '../pack/context'
import { loadPackSource } from '../pack/load'
import { packSchema } from '../pack/schema'
import { validatePack } from '../pack/validate'
import { demoContext, demoPackRaw } from './__fixtures__/demo-pack'
import type { NutrientBudget } from './fertigation'
import { runBlockDay, type BlockDayInput, type CarriedWaterState } from './run-block'
import { addDays, type HourlyWeatherPoint } from './weather'

const MAY = '2026-05-10'

/** Seven past days and four forecast days around `today`, mild and dry; one optional cold night tomorrow. */
function weather(today: string, coldNightC: number | null = null): HourlyWeatherPoint[] {
  return Array.from({ length: 11 }, (_, i) => addDays(today, i - 7)).flatMap(localDate =>
    Array.from({ length: 24 }, (_, h) => ({
      localDate,
      localHour: h,
      tempC: coldNightC !== null && localDate === addDays(today, 1) && h === 5 ? coldNightC : 17 + 7 * Math.cos((2 * Math.PI * (h - 15)) / 24),
      rhPct: 60,
      wind10mMs: 2.7,
      shortwaveWm2: h >= 6 && h <= 18 ? 500 * Math.sin((Math.PI * (h - 6)) / 12) : 0,
      precipMm: 0,
      precipProbPct: localDate >= today ? 0 : null,
      forecast: localDate >= today,
    })),
  )
}

/** A balance carried through yesterday with the given depletion; 90 mm is past the refill point. */
const carried = (today: string, Dr: number): CarriedWaterState => ({
  through: addDays(today, -1),
  Dr,
  De: 22.5,
  fw: 0.4,
  etcSinceIrrigation: 40,
  gapsMm: [],
  initialAssumed: false,
  last: { et0: 5, etc: 4.5, raw: 75, taw: 150, ks: 1 },
})

function input(over: Partial<BlockDayInput> = {}, today = MAY): BlockDayInput {
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
    carried: carried(today, 20),
    ageYears: 8,
    yield: { blockEstimate: 2000, matureTarget: 3000, pricePerUnit: 5 },
    lab: { soilEce: null, waterEc: null },
    nutrition: { applied: {}, tissue: null },
    ...over,
  }
}

const by = (r: ReturnType<typeof runBlockDay>, engine: string) => r.actions.filter(a => a.engineId === engine)
const almond = () => createPackContext(packSchema.parse(loadPackSource(join(__dirname, '../../packs/almond/0.1.1')).raw))

describe('the made-up test pack', () => {
  it('is itself a valid pack apart from its missing test cases', () => {
    const r = validatePack(demoPackRaw())
    expect(r.errors.filter(e => e.code !== 'V6')).toEqual([])
  })
})

describe('yield calculations', () => {
  it('weights prior and observation by their precision', () => {
    const r = updateYieldEstimate({ mean: 2000, sd: 400 }, { mean: 2600, sd: 200 })
    expect(r.mean).toBeCloseTo(2480, 6)
    expect(r.sd).toBeCloseTo(Math.sqrt(1 / (1 / 160000 + 1 / 40000)), 6)
  })

  it('lets an observation replace a prior when either uncertainty is unknown', () => {
    expect(updateYieldEstimate({ mean: 2000, sd: null }, { mean: 2600, sd: 200 })).toEqual({ mean: 2600, sd: 200 })
    expect(updateYieldEstimate({ mean: 2000, sd: 400 }, { mean: 2600, sd: null })).toEqual({ mean: 2600, sd: null })
  })

  it('applies damage events one after another', () => {
    expect(applyDamage({ mean: 2000, sd: 200 }, [0.5, 0.1])).toEqual({ mean: 900, sd: 90 })
    expect(() => applyDamage({ mean: 2000, sd: null }, [1.2])).toThrow()
  })

  it('reads the fraction of mature yield at an age from the curve', () => {
    const curve = [{ ageYears: 6, fraction: 1 }, { ageYears: 3, fraction: 0.3 }]
    expect(yieldFractionAtAge(curve, 1)).toBe(0)
    expect(yieldFractionAtAge(curve, 4)).toBe(0.3)
    expect(yieldFractionAtAge(curve, 20)).toBe(1)
    expect(yieldFractionAtAge([], 5)).toBeNull()
  })

  it('multiplies yield components', () => {
    expect(yieldFromComponents(5000, 0.0012, 300)).toBeCloseTo(1800, 6)
  })
})

describe('tissue classification', () => {
  const band = { deficientBelow: 2.0, adequateFrom: 2.2, adequateTo: 2.5, excessiveAbove: 2.7 }

  it.each([
    [1.9, 'deficient'],
    [2.1, 'low'],
    [2.3, 'adequate'],
    [2.6, 'high'],
    [2.8, 'excessive'],
  ])('%d is %s', (value, status) => {
    expect(classifyTissue(value, band)).toBe(status)
  })

  it('judges only against the limits the band gives', () => {
    expect(classifyTissue(1.6, { deficientBelow: 1.0, adequateFrom: 1.4, adequateTo: null, excessiveAbove: null })).toBe('adequate')
    expect(classifyTissue(9, { deficientBelow: null, adequateFrom: 0.1, adequateTo: 0.3, excessiveAbove: null })).toBe('high')
    expect(classifyTissue(5, { deficientBelow: null, adequateFrom: null, adequateTo: null, excessiveAbove: null })).toBe('not_judged')
  })
})

describe('yield forecast engine', () => {
  it("uses the manager's estimate for the block, with the crop's money value", () => {
    const r = runBlockDay(input())
    expect(r.state).toMatchObject({ expected_yield: 2000, expected_yield_sd: 400, expected_yield_source: 'block_estimate', expected_yield_unit: 'kg/ha', crop_value: 20000 })
    expect(r.engines.yield_forecast.diagnosis?.outcome).toBe('estimated')
  })

  it('falls back to the farm target scaled by the pack curve for the block age', () => {
    const at = (ageYears: number) => runBlockDay(input({ ageYears, yield: { blockEstimate: null, matureTarget: 3000, pricePerUnit: null } })).state
    expect(at(8)).toMatchObject({ expected_yield: 3000, expected_yield_source: 'age_curve' })
    expect(at(4).expected_yield).toBeCloseTo(900, 6)
    expect(at(1).expected_yield).toBe(0)
    expect(at(8).crop_value).toBeUndefined()
  })

  it('says what is missing when it cannot estimate', () => {
    const r = runBlockDay(input({ ageYears: null, yield: { blockEstimate: null, matureTarget: null, pricePerUnit: 5 } }))
    expect(r.state.expected_yield).toBeUndefined()
    expect(r.state.yield_missing).toEqual(["the farm's mature-yield target or an estimate for the block", 'the planting year of the block'])
    expect(r.engines.yield_forecast.diagnosis?.outcome).toBeNull()
  })

  it('updates the prior with observations and reduces it by observed damage', () => {
    const r = runBlockDay(input({ yield: { blockEstimate: 2000, matureTarget: null, pricePerUnit: null, observations: [{ mean: 2600, sd: 200 }], damageFractions: [0.5] } }))
    expect(r.state.expected_yield).toBeCloseTo(1240, 6)
    expect(r.state.expected_yield_source).toBe('observations')
  })

  it('gives the frost engine a projected loss when a damage fraction is known', () => {
    const r = runBlockDay(input({ varietyId: 'hardy', recordedStage: { stage: 'flowers', recordedAt: null, source: 'manual' }, weather: weather(MAY, -4) }))
    const [a] = by(r, 'frost')
    expect(a.inputsSnapshot.damage_fraction).toBeCloseTo(0.5, 6)
    expect(a.inputsSnapshot.projected_loss).toBe(10000)
  })

  it('cannot estimate a young block from the almond pack, which has no curve by age', () => {
    const r = runBlockDay(input({ pack: almond(), ageYears: 1, recordedStage: { stage: 'dormancy', recordedAt: null, source: null }, yield: { blockEstimate: null, matureTarget: 2500, pricePerUnit: null } }))
    expect(r.state.yield_missing).toEqual(['a curve of yield by age in the pack'])
  })
})

describe('salinity engine', () => {
  const water = (value: number) => ({ soilEce: null, waterEc: { value, at: '2026-03-01T00:00:00Z' } })

  it('sets the leaching fraction from the water analysis, and irrigation adds it', () => {
    const r = runBlockDay(input({ carried: carried(MAY, 90), lab: water(1.2) }))
    expect(r.state.leaching_requirement).toBeCloseTo(0.1905, 3)
    expect(r.state.leaching_fraction).toBeCloseTo(0.1905, 3)
    expect(r.state.flags).not.toContain('LEACHING_NOT_ASSESSED')
    const [irrigation] = by(r, 'irrigation')
    // 90 mm / 0.9 efficiency x (1 + 0.1905)
    expect(irrigation.quantity).toBe(119)
    expect(irrigation.flags).not.toContain('LEACHING_NOT_ASSESSED')
  })

  it("holds the leaching fraction at the pack's upper bound", () => {
    const r = runBlockDay(input({ lab: water(3) }))
    expect(r.state.leaching_requirement).toBeCloseTo(0.667, 3)
    expect(r.state.leaching_fraction).toBe(0.25)
    expect(r.engines.salinity.diagnosis?.notes.join(' ')).toMatch(/above the pack's upper bound 0\.25/)
  })

  it('adds nothing and says so when there is no water analysis', () => {
    const r = runBlockDay(input())
    expect(r.state.leaching_fraction).toBe(0)
    expect(r.state.flags).toContain('LEACHING_NOT_ASSESSED')
    expect(r.engines.salinity.diagnosis?.notes).toContain('No water analysis with an EC value, so no leaching fraction is set')
  })

  it('warns when the water is too saline to manage by leaching', () => {
    const r = runBlockDay(input({ lab: water(8) }))
    expect(by(r, 'salinity')).toMatchObject([{ ruleId: 'SAL-WATER-TOO-SALINE', actionType: 'water_source_warning' }])
    expect(r.state.leaching_fraction).toBe(0)
  })

  it('reports relative yield and asks for a new sample when soil salinity is above the threshold', () => {
    const r = runBlockDay(input({ lab: { soilEce: { value: 3, at: '2026-02-01T00:00:00Z' }, waterEc: null } }))
    expect(r.state.salinity_relative_yield_pct).toBeCloseTo(71.5, 6)
    expect(by(r, 'salinity')).toMatchObject([{ ruleId: 'SAL-SOIL-ABOVE-THRESHOLD', actionType: 'soil_sampling', evidence: 'SRC' }])
  })

  it('proposes nothing for a soil below the threshold', () => {
    const r = runBlockDay(input({ lab: { soilEce: { value: 0.8, at: '2026-02-01T00:00:00Z' }, waterEc: null } }))
    expect(r.state.salinity_relative_yield_pct).toBe(100)
    expect(by(r, 'salinity')).toEqual([])
  })

  it('computes the requirement with the almond pack but does not add it, because the pack gives no upper bound', () => {
    const r = runBlockDay(input({ pack: almond(), recordedStage: { stage: 'dormancy', recordedAt: null, source: null }, lab: water(1.2) }))
    expect(r.state.leaching_requirement).toBeCloseTo(0.1905, 3)
    expect(r.state.leaching_fraction).toBe(0)
    expect(r.engines.salinity.diagnosis?.notes.join(' ')).toMatch(/not added to irrigation: the pack gives no upper bound/)
  })
})

describe('fertigation and nutrition engine', () => {
  const budget = (r: ReturnType<typeof runBlockDay>) => r.state.nutrient_budget as Record<string, NutrientBudget>
  const leaf = (values: Record<string, number>, sampledAt = '2026-04-01') => ({ sampledAt, tissue: 'leaf', values })

  it('builds the annual budget from the yield forecast and splits it by phase', () => {
    const b = budget(runBlockDay(input()))
    // (2000 x 0.05 + 10) / 0.8
    expect(b.N.annualKgHa).toBeCloseTo(137.5, 6)
    expect(b.N.byPhase).toEqual({ flowering: 55, growing: 82.5 })
    // 2000 x 0.06 / 0.8, with no phase split in the pack
    expect(b.K).toMatchObject({ annualKgHa: 150, byPhase: null })
  })

  it('has no budget without a yield estimate, and says so', () => {
    const r = runBlockDay(input({ ageYears: null, yield: { blockEstimate: null, matureTarget: null, pricePerUnit: null } }))
    expect(budget(r).N).toMatchObject({ annualKgHa: null, missing: ['an expected yield for the block'] })
    expect(r.engines.fertigation.diagnosis?.outcome).toBeNull()
  })

  it('places a dose on a proposed irrigation, capped at the maximum single dose', () => {
    const r = runBlockDay(input({ carried: carried(MAY, 90) }))
    const [irrigation] = by(r, 'irrigation')
    const doses = by(r, 'fertigation')
    expect(doses).toHaveLength(1)
    expect(doses[0]).toMatchObject({ ruleId: 'FERT-PHASE-DOSE', actionType: 'fertigate_N', quantity: 25, unit: 'kg N/ha', evidence: 'SRC' })
    expect(doses[0].inputsSnapshot).toMatchObject({ phase: 'growing', phase_kg_ha: 82.5, applied_kg_ha: 0, max_single_dose_kg_ha: 25, with_irrigation: irrigation.actionId })
  })

  it('doses only what remains of the phase amount', () => {
    const dose = (appliedN: number) => by(runBlockDay(input({ carried: carried(MAY, 90), nutrition: { applied: { N: appliedN }, tissue: null } })), 'fertigation')
    expect(dose(70)[0].quantity).toBe(12.5)
    expect(dose(90)).toEqual([])
  })

  it('proposes no dose on a day with no irrigation', () => {
    expect(by(runBlockDay(input()), 'fertigation')).toEqual([])
  })

  it('proposes no dose when what was applied this season is not known', () => {
    const r = runBlockDay(input({ carried: carried(MAY, 90), nutrition: { applied: null, tissue: null } }))
    expect(by(r, 'fertigation')).toEqual([])
    expect(r.engines.fertigation.diagnosis?.notes.join(' ')).toMatch(/nutrient content of the products is not known/)
  })

  it('reads a tissue analysis against the bands for that tissue only', () => {
    const r = runBlockDay(input({ nutrition: { applied: {}, tissue: leaf({ n: 1.9, k: 0.5 }) } }))
    // The K band is for another tissue, so a leaf value is not judged against it.
    expect(r.state.nutrient_status).toEqual({ N: 'deficient' })
  })

  it('stops dosing a nutrient that is excessive in the tissue', () => {
    const r = runBlockDay(input({ carried: carried(MAY, 90), nutrition: { applied: {}, tissue: leaf({ N: 2.8 }) } }))
    expect(r.state.nutrient_status).toEqual({ N: 'excessive' })
    expect(by(r, 'fertigation')).toEqual([])
  })

  it('asks for the tissue sample in the sampling month when none was taken this year', () => {
    const july = '2026-07-10'
    const due = runBlockDay(input({ nutrition: { applied: {}, tissue: leaf({ N: 2.3 }, '2025-07-12') } }, july))
    expect(by(due, 'fertigation')).toMatchObject([{ ruleId: 'FERT-SAMPLE-DUE', actionType: 'tissue_sampling' }])
    const done = runBlockDay(input({ nutrition: { applied: {}, tissue: leaf({ N: 2.3 }, '2026-07-02') } }, july))
    expect(by(done, 'fertigation')).toEqual([])
    expect(by(runBlockDay(input()), 'fertigation')).toEqual([])
  })

  it('with the almond pack: no nitrogen budget and no dose until its missing values are sourced', () => {
    const r = runBlockDay(input({ pack: almond(), recordedStage: { stage: 'nut-development', recordedAt: null, source: null } }))
    const b = budget(r)
    expect(b.N).toMatchObject({ annualKgHa: null, missing: ['$n_growth_young_kg_ha (to be sourced)'] })
    // 2000 kg/ha x 0.0085 / 0.7 and 2000 x 0.075 / 0.7
    expect(b.P.annualKgHa).toBeCloseTo(24.29, 2)
    expect(b.K.annualKgHa).toBeCloseTo(214.29, 2)
    expect(r.engines.fertigation.diagnosis?.notes.join(' ')).toMatch(/No dose can be proposed: \$max_single_dose_kg_ha is still to be sourced/)
    expect(by(r, 'fertigation')).toEqual([])
  })

  it('judges an almond leaf sample against the pack bands', () => {
    const r = runBlockDay(input({ pack: almond(), recordedStage: { stage: 'nut-development', recordedAt: null, source: null }, nutrition: { applied: {}, tissue: leaf({ n: 2.65, p: 0.2, k: 1.2, b: 40 }) } }))
    // Boron is not judged: the pack's band is for hulls, and the sample is leaves.
    expect(r.state.nutrient_status).toEqual({ N: 'high', P: 'adequate', K: 'low' })
  })
})
