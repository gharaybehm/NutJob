import { describe, expect, it } from 'vitest'
import { POLICY_DEFAULTS, validateBlockConfig, validateFarmPolicy } from './farm-policy'

const valid = { ...POLICY_DEFAULTS }

describe('validateFarmPolicy', () => {
  it('accepts the defaults', () => {
    const r = validateFarmPolicy(valid)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual(valid)
  })

  it('accepts numeric strings from a form and rounds to the column precision', () => {
    const r = validateFarmPolicy({
      ...valid,
      allowableDepletion: '0.456',
      defaultRootDepthM: '1.26',
      wellLicenceVolumeM3: '120000.6',
      frostMarginC: '1.25',
    })
    expect(r.ok && r.value).toMatchObject({ allowableDepletion: 0.46, defaultRootDepthM: 1.3, wellLicenceVolumeM3: 120001, frostMarginC: 1.3 })
  })

  it('allows the optional values to be empty', () => {
    const r = validateFarmPolicy({ ...valid, defaultRootDepthM: '', wellLicenceVolumeM3: null, wellLicenceSeasonYear: '' })
    expect(r.ok && r.value).toMatchObject({ defaultRootDepthM: null, wellLicenceVolumeM3: null, wellLicenceSeasonYear: null })
  })

  it.each([
    ['empty strategy name', { irrigationStrategyName: '   ' }, /Strategy name/],
    ['depletion of zero', { allowableDepletion: 0 }, /Allowable depletion/],
    ['depletion above one', { allowableDepletion: 1.2 }, /Allowable depletion/],
    ['efficiency above one', { irrigationEfficiency: 90 }, /efficiency/],
    ['root depth too deep', { defaultRootDepthM: 9 }, /Root depth/],
    ['negative root depth', { defaultRootDepthM: -1 }, /Root depth/],
    ['not a number', { defaultRootDepthM: 'deep' }, /Root depth/],
    ['negative licence volume', { wellLicenceVolumeM3: -5 }, /licence volume/],
    ['a licence year of 26', { wellLicenceSeasonYear: 26 }, /year/],
    ['a huge frost margin', { frostMarginC: 30 }, /Frost alert margin/],
    ['zero sensor hours', { sensorFailedAfterHours: 0 }, /Sensor failure/],
    ['fractional sensor hours', { sensorFailedAfterHours: 2.5 }, /Sensor failure/],
  ])('rejects %s', (_label, patch, message) => {
    const r = validateFarmPolicy({ ...valid, ...patch })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(message)
  })

  it('rejects a missing or non-object input rather than saving defaults silently', () => {
    expect(validateFarmPolicy(null).ok).toBe(false)
    expect(validateFarmPolicy('x').ok).toBe(false)
  })
})

describe('validateBlockConfig', () => {
  it('accepts a full valid block config and trims the notes', () => {
    const r = validateBlockConfig({ fieldCapacity: 30, wiltingPoint: 12, rootDepthM: '1.5', notes: '  clay loam  ' })
    expect(r.ok && r.value).toEqual({ fieldCapacity: 30, wiltingPoint: 12, rootDepthM: 1.5, notes: 'clay loam' })
  })

  it('allows everything empty', () => {
    const r = validateBlockConfig({ fieldCapacity: null, wiltingPoint: null, rootDepthM: null, notes: '' })
    expect(r.ok && r.value).toEqual({ fieldCapacity: null, wiltingPoint: null, rootDepthM: null, notes: null })
  })

  it('requires the wilting point to be below field capacity, which the irrigation engine also needs', () => {
    const r = validateBlockConfig({ fieldCapacity: 12, wiltingPoint: 30, rootDepthM: 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/lower than field capacity/)
  })

  it('rejects percentages outside 0 to 100 and a bad root depth', () => {
    expect(validateBlockConfig({ fieldCapacity: 140, wiltingPoint: 10 }).ok).toBe(false)
    expect(validateBlockConfig({ fieldCapacity: 30, wiltingPoint: 10, rootDepthM: 0 }).ok).toBe(false)
    expect(validateBlockConfig({ fieldCapacity: 30, wiltingPoint: 10, rootDepthM: 6 }).ok).toBe(false)
  })
})

describe('validateFarmPolicy: nitrogen fields', () => {
  it('accepts a yield target and a split that adds up to 100 %', () => {
    const r = validateFarmPolicy({ ...valid, nYieldTargetKgHa: '2500', nSplit: [{ label: 'Spring', percent: '30' }, { label: 'Summer', percent: '40' }, { label: 'Post-harvest', percent: '30' }, { label: '', percent: '' }] })
    expect(r.ok && r.value).toMatchObject({ nYieldTargetKgHa: 2500, nSplit: [{ label: 'Spring', share: 0.3 }, { label: 'Summer', share: 0.4 }, { label: 'Post-harvest', share: 0.3 }] })
  })

  it('treats an empty target and an empty split as not set', () => {
    const r = validateFarmPolicy({ ...valid, nYieldTargetKgHa: '', nSplit: [{ label: '', percent: '' }] })
    expect(r.ok && r.value).toMatchObject({ nYieldTargetKgHa: null, nSplit: null })
  })

  it.each([
    ['a target of zero', { nYieldTargetKgHa: 0 }, /yield target/],
    ['a target above 10,000', { nYieldTargetKgHa: 20000 }, /yield target/],
    ['shares not adding to 100', { nSplit: [{ label: 'A', percent: 50 }, { label: 'B', percent: 30 }] }, /add up to 80 %/],
    ['a share with no name', { nSplit: [{ label: '', percent: 100 }] }, /needs a name/],
    ['a name with no share', { nSplit: [{ label: 'A', percent: '' }] }, /share for "A"/],
  ])('refuses %s', (_name, over, msg) => {
    const r = validateFarmPolicy({ ...valid, ...over })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(msg)
  })
})
