import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { demoPackRaw } from '@/engines/decision/__fixtures__/demo-pack'
import { observationForms, validateObservation } from '@/engines/pack/forms'
import { loadPackSource } from '@/engines/pack/load'
import { packSchema } from '@/engines/pack/schema'
import { missingLabelValues, validateProduct } from './products'

const TODAY = '2026-10-09'
const demo = packSchema.parse(demoPackRaw())
const forms = observationForms(demo)
const form = (kind: string, subject: string | null) => forms.find(f => f.kind === kind && f.subject === subject)

describe('forms generated from a pack', () => {
  it('gives each pest its own observations and an observed biofix', () => {
    expect(form('trap_check', 'grub')).toMatchObject({ subjectName: 'Demo grub', fields: [{ id: 'count', type: 'number' }, { id: 'traps', type: 'number' }, { id: 'traps_with', type: 'number' }] })
    expect(form('biofix', 'grub')).toMatchObject({ subjectName: 'Demo grub', fields: [] })
  })

  it('makes an observation the harvest engine reads a block-level one, listed once', () => {
    expect(forms.filter(f => f.kind === 'ripeness')).toEqual([{ kind: 'ripeness', subject: null, subjectName: null, fields: [{ id: 'pct', label: 'Ripe (%)', type: 'number' }] }])
  })

  it('asks whether hives are present when the pack has a pollination section', () => {
    expect(form('hives', null)?.fields).toEqual([{ id: 'present', label: null, type: 'boolean' }])
  })

  it('reads the almond pack: egg traps, hull split, moth traps, shoot strikes, two biofix forms and hives', () => {
    const almond = observationForms(packSchema.parse(loadPackSource(join(__dirname, '../../packs/almond/0.1.1')).raw))
    expect(almond.map(f => `${f.kind}:${f.subject ?? '-'}`)).toEqual(['trap_check:now', 'hull_split:-', 'biofix:now', 'trap_check:ptb', 'shoot_strikes:ptb', 'biofix:ptb', 'hives:-'])
  })
})

describe('validateObservation', () => {
  const entry = (over: object = {}) => ({ kind: 'trap_check', subject: 'grub', observedOn: '2026-10-08', values: { count: '14', traps: 4, traps_with: '3' }, ...over })

  it('keeps the fields the form asks for, as numbers', () => {
    const r = validateObservation(forms, entry({ values: { count: '14', traps: 4, something_else: 9 }, notes: '  north rows  ' }), TODAY)
    expect(r).toEqual({ ok: true, value: { kind: 'trap_check', subject: 'grub', observedOn: '2026-10-08', values: { count: 14, traps: 4 }, notes: 'north rows' } })
  })

  it('accepts a decimal comma', () => {
    expect(validateObservation(forms, { kind: 'ripeness', subject: null, observedOn: TODAY, values: { pct: '2,5' } }, TODAY)).toMatchObject({ value: { values: { pct: 2.5 } } })
  })

  it('accepts a biofix as a date alone, and hives as yes or no', () => {
    expect(validateObservation(forms, { kind: 'biofix', subject: 'grub', observedOn: TODAY, values: {} }, TODAY).ok).toBe(true)
    expect(validateObservation(forms, { kind: 'hives', subject: null, observedOn: TODAY, values: { present: false } }, TODAY)).toMatchObject({ value: { values: { present: false } } })
  })

  it.each([
    [entry({ kind: 'made_up' }), { ok: false, error: 'unknownForm' }],
    [entry({ subject: 'other_pest' }), { ok: false, error: 'unknownForm' }],
    [entry({ observedOn: '2026-11-01' }), { ok: false, error: 'date' }],
    [entry({ observedOn: 'yesterday' }), { ok: false, error: 'date' }],
    [entry({ values: {} }), { ok: false, error: 'noValues' }],
    [entry({ values: { count: 'many' } }), { ok: false, error: 'value', field: 'count' }],
    [entry({ values: { count: -2 } }), { ok: false, error: 'value', field: 'count' }],
  ])('refuses %j', (input, expected) => {
    expect(validateObservation(forms, input as never, TODAY)).toEqual(expected)
  })

  it('refuses a yes or no field given as text', () => {
    expect(validateObservation(forms, { kind: 'hives', subject: null, observedOn: TODAY, values: { present: 'yes' } }, TODAY)).toEqual({ ok: false, error: 'value', field: 'present' })
  })
})

describe('validateProduct', () => {
  const product = (over: object = {}) => ({
    name: '  Product one ',
    productType: 'fungicide',
    activeIngredient: 'something',
    modeOfActionGroup: '11',
    targets: ['spot', 'spot', 'blight'],
    registeredCrops: ['demo'],
    maxWindMs: '4',
    minWindMs: '0,5',
    rainfastHours: 6,
    phiDays: 14,
    reiHours: 24,
    maxApplicationsPerSeason: 2,
    beeToxic: false,
    nutrientContent: {},
    ...over,
  })

  it('accepts a full label', () => {
    const r = validateProduct(product())
    expect(r).toMatchObject({ ok: true, value: { name: 'Product one', targets: ['spot', 'blight'], maxWindMs: 4, minWindMs: 0.5, nutrientContent: null, beeToxic: false } })
  })

  it('accepts a label with values missing, since the safeguards block what is missing', () => {
    const r = validateProduct({ name: 'Bare', productType: 'insecticide' })
    expect(r).toMatchObject({ ok: true, value: { maxWindMs: null, phiDays: null, beeToxic: null, targets: [], registeredCrops: [] } })
  })

  it('keeps the nutrient content of a fertiliser', () => {
    expect(validateProduct(product({ productType: 'fertiliser', nutrientContent: { N: '46', P: '' } }))).toMatchObject({ value: { nutrientContent: { N: 46 } } })
  })

  it.each([
    [{ name: '  ' }, 'name'],
    [{ productType: 'potion' }, 'type'],
    [{ targets: ['Not An Id'] }, 'targets'],
    [{ registeredCrops: ['Almond!'] }, 'crops'],
    [{ maxWindMs: -1 }, 'wind'],
    [{ maxWindMs: 2, minWindMs: 3 }, 'windOrder'],
    [{ rainfastHours: 'soon' }, 'rainfast'],
    [{ phiDays: 2.5 }, 'phi'],
    [{ reiHours: -4 }, 'rei'],
    [{ maxApplicationsPerSeason: 1.5 }, 'maxApplications'],
    [{ nutrientContent: { N: 80, K: 40 } }, 'nutrients'],
  ])('refuses %j with %s', (over, error) => {
    expect(validateProduct(product(over))).toEqual({ ok: false, error })
  })
})

describe('missing label values', () => {
  it('names each missing value with the safeguard that blocks the product without it', () => {
    const missing = missingLabelValues({ productType: 'fungicide', maxWindMs: 4, minWindMs: 0.5, rainfastHours: null, phiDays: 14, reiHours: null, maxApplicationsPerSeason: 2, beeToxic: null, registeredCrops: [] })
    expect(missing.map(m => m.safeguardId)).toEqual(['SG-SPR-3', 'SG-SPR-5', 'SG-SPR-8', 'SG-SPR-7'])
  })

  it('asks nothing of a fertiliser', () => {
    expect(missingLabelValues({ productType: 'fertiliser' })).toEqual([])
  })

  it('finds nothing missing on a full label', () => {
    expect(missingLabelValues({ productType: 'insecticide', maxWindMs: 4, minWindMs: 0, rainfastHours: 6, phiDays: 0, reiHours: 12, maxApplicationsPerSeason: 1, beeToxic: true, registeredCrops: ['demo'] })).toEqual([])
  })
})
