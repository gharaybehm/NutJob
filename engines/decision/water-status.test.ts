import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { createPackContext } from '../pack/context'
import { loadPackSource } from '../pack/load'
import { packSchema } from '../pack/schema'
import { demoContext } from './__fixtures__/demo-pack'
import { waterStatusValues, WATER_STATUS_KEYS } from './water-status'

const TODAY = '2026-07-10'
const almond = createPackContext(packSchema.parse(loadPackSource(join(__dirname, '../../packs/almond/0.1.2')).raw))
const reading = (observedOn: string, values: Record<string, number>) => ({ kind: 'plant_water_status', subject: null, observedOn, values })

describe('waterStatusValues', () => {
  it('publishes the latest reading, its age and its deviation under the names the pack tables read', () => {
    const p = waterStatusValues(almond, [reading('2026-07-01', { reading: -9, air_temp_F: 90 }), reading('2026-07-08', { reading: -14, air_temp_F: 95 })], TODAY)
    // Baseline -(95 / 10) = -9.5 bar, so the tree is 4.5 bar drier than a well-watered one.
    expect(p.values).toMatchObject({ swp_bar: -14, swp_age_days: 2, swp_deviation_bar: -4.5, [WATER_STATUS_KEYS.reading]: -14, water_status_baseline: -9.5 })
    expect(p.flags).toEqual([])
  })

  it('keeps the reading but no deviation when the baseline input is missing, and says why', () => {
    const p = waterStatusValues(almond, [reading('2026-07-08', { reading: -14 })], TODAY)
    expect(p.values).toMatchObject({ swp_bar: -14, swp_deviation_bar: null })
    expect(p.notes[0]).toMatch(/baseline cannot be worked out/)
  })

  it('says when there is no reading, and does nothing for a pack without water status', () => {
    expect(waterStatusValues(almond, [], TODAY)).toMatchObject({ values: {}, notes: ['No midday_stem_water_potential reading recorded'] })
    expect(waterStatusValues(demoContext(raw => delete (raw.water as Record<string, unknown>).plant_water_status), [reading('2026-07-08', { reading: -14 })], TODAY)).toEqual({ values: {}, flags: [], notes: [] })
  })

  it('lets the almond irrigation table act on a dry tree before the water balance says so', () => {
    const state = { phase: 'fruit_growth', rain_48h_mm: 0, rain_prob: 0, rdi_enabled: false, Dr: 30, RAW: 50, efficiency: 0.9, leaching_fraction: 0, ETc_since_last: 20 }
    // Without a reading the balance alone holds (Dr below RAW).
    expect(almond.evaluate('irrigation', state).rowId).toBe('ALM-IRR-04')
    const p = waterStatusValues(almond, [reading('2026-07-09', { reading: -14, air_temp_F: 95 })], TODAY)
    expect(almond.evaluate('irrigation', { ...state, ...p.values }).rowId).toBe('ALM-IRR-03')
  })
})
