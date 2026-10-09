import { describe, expect, it } from 'vitest'
import { validateBlockSetup, validateFarmSetup } from './setup'

const TODAY = '2026-10-09'

describe('validateBlockSetup', () => {
  it('turns the percentages entered into the fractions stored', () => {
    const r = validateBlockSetup({ canopyCoverPct: '12', canopyHeightM: '1.45', canopyMeasuredOn: '2026-10-01', wettedFractionPct: 30, expectedYieldKgHa: '' }, TODAY)
    expect(r).toEqual({
      ok: true,
      value: { canopyCoverFraction: 0.12, canopyHeightM: 1.5, canopyMeasuredOn: '2026-10-01', wettedFraction: 0.3, expectedYieldKgHa: null, expectedYieldSeason: null },
    })
  })

  it('dates a canopy measurement today when no date is given, and leaves the date empty when nothing was measured', () => {
    expect(validateBlockSetup({ canopyCoverPct: 12 }, TODAY)).toMatchObject({ value: { canopyMeasuredOn: TODAY } })
    expect(validateBlockSetup({ canopyMeasuredOn: '2026-10-01' }, TODAY)).toMatchObject({ value: { canopyMeasuredOn: null } })
  })

  it('records the season with a yield estimate', () => {
    expect(validateBlockSetup({ expectedYieldKgHa: '0' }, TODAY)).toMatchObject({ value: { expectedYieldKgHa: 0, expectedYieldSeason: 2026 } })
  })

  it('accepts everything empty', () => {
    expect(validateBlockSetup({}, TODAY)).toEqual({
      ok: true,
      value: { canopyCoverFraction: null, canopyHeightM: null, canopyMeasuredOn: null, wettedFraction: null, expectedYieldKgHa: null, expectedYieldSeason: null },
    })
  })

  it.each([
    [{ canopyCoverPct: 140 }, 'canopyCover'],
    [{ canopyCoverPct: -1 }, 'canopyCover'],
    [{ canopyCoverPct: 'lots' }, 'canopyCover'],
    [{ canopyHeightM: 0 }, 'canopyHeight'],
    [{ canopyHeightM: 45 }, 'canopyHeight'],
    [{ canopyCoverPct: 10, canopyMeasuredOn: '2026-12-01' }, 'canopyDate'],
    [{ canopyCoverPct: 10, canopyMeasuredOn: '01/10/2026' }, 'canopyDate'],
    [{ wettedFractionPct: 0 }, 'wettedFraction'],
    [{ wettedFractionPct: 101 }, 'wettedFraction'],
    [{ expectedYieldKgHa: -5 }, 'expectedYield'],
  ])('refuses %j with %s', (input, error) => {
    expect(validateBlockSetup(input, TODAY)).toEqual({ ok: false, error })
  })
})

describe('validateFarmSetup', () => {
  it('accepts a full set of values', () => {
    const r = validateFarmSetup({ pricePerYieldUnit: '285.5', priceCurrency: 'try', dailyLabourHours: 64, dailyWaterM3: '2500', sprayerCount: '1', frostProtectionMethod: 'wind_machine' })
    expect(r).toEqual({
      ok: true,
      value: { pricePerYieldUnit: 285.5, priceCurrency: 'TRY', dailyLabourHours: 64, dailyWaterM3: 2500, sprayerCount: 1, frostProtectionMethod: 'wind_machine' },
    })
  })

  it('leaves every limit unset when empty, and drops a currency given without a price', () => {
    expect(validateFarmSetup({ priceCurrency: 'USD' })).toEqual({
      ok: true,
      value: { pricePerYieldUnit: null, priceCurrency: null, dailyLabourHours: null, dailyWaterM3: null, sprayerCount: null, frostProtectionMethod: null },
    })
  })

  it.each([
    [{ pricePerYieldUnit: -1, priceCurrency: 'TRY' }, 'price'],
    [{ pricePerYieldUnit: 10 }, 'currency'],
    [{ pricePerYieldUnit: 10, priceCurrency: 'lira' }, 'currency'],
    [{ dailyLabourHours: -8 }, 'labourHours'],
    [{ dailyWaterM3: 'much' }, 'dailyWater'],
    [{ sprayerCount: 1.5 }, 'sprayers'],
    [{ frostProtectionMethod: 'prayer' }, 'frostMethod'],
  ])('refuses %j with %s', (input, error) => {
    expect(validateFarmSetup(input)).toEqual({ ok: false, error })
  })
})
