/**
 * Field forms generated from the pack (CDSS spec §A2, R2.2: the pack
 * defines which observations the forms ask for).
 *
 * A form is one kind of observation for one subject: a trap check for a
 * pest, a count on the block. Three kinds come from the platform itself,
 * because its own rules read them: an observed biofix for each pest the pack
 * models, whether hives are in the block, and the maturity observations the
 * harvest engine judges readiness by.
 */

import type { Pack } from './schema'

export interface ObservationField {
  id: string
  /** The label the pack gives the field; null for a platform field the interface names. */
  label: string | null
  type: 'number' | 'boolean' | 'text'
}

export interface ObservationForm {
  kind: string
  /** The pack id of the pest it concerns; null for an observation of the block. */
  subject: string | null
  /** The pest's name in the pack. */
  subjectName: string | null
  fields: ObservationField[]
}

/** Observation kinds the platform's own rules read. */
export const BIOFIX_KIND = 'biofix'
export const HIVES_KIND = 'hives'

export function observationForms(pack: Pack): ObservationForm[] {
  const forms: ObservationForm[] = []
  const seen = new Set<string>()
  const add = (form: ObservationForm) => {
    const key = `${form.kind}|${form.subject ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    forms.push(form)
  }

  // Observations the harvest engine reads describe the block, whichever pest model also uses them.
  const maturity = pack.seasonal?.harvest?.maturity ?? []
  const blockLevel = new Set(maturity.map(m => m.observation))

  for (const pest of pack.pests?.pests ?? []) {
    for (const o of pest.observations) {
      add({ kind: o.kind, subject: blockLevel.has(o.kind) ? null : pest.id, subjectName: blockLevel.has(o.kind) ? null : pest.name, fields: o.fields })
    }
    add({ kind: BIOFIX_KIND, subject: pest.id, subjectName: pest.name, fields: [] })
  }
  for (const m of maturity) {
    add({ kind: m.observation, subject: null, subjectName: null, fields: [{ id: m.field, label: null, type: 'number' }] })
  }
  if (pack.seasonal?.pollination) {
    add({ kind: HIVES_KIND, subject: null, subjectName: null, fields: [{ id: 'present', label: null, type: 'boolean' }] })
  }
  return forms
}

export type ObservationError = 'unknownForm' | 'date' | 'noValues' | 'value'

export interface ObservationInput {
  kind: string
  subject: string | null
  /** Farm-local ISO date. */
  observedOn: string
  values: Record<string, unknown>
  notes?: string | null
}

export type ObservationValidation =
  | { ok: true; value: { kind: string; subject: string | null; observedOn: string; values: Record<string, number | boolean | string>; notes: string | null } }
  | { ok: false; error: ObservationError; field?: string }

const MAX_TEXT = 500
const MAX_NUMBER = 1_000_000

/** Checks an entry against the forms of the block's pack. Only the fields the form asks for are kept. */
export function validateObservation(forms: ObservationForm[], input: ObservationInput, today: string): ObservationValidation {
  const form = forms.find(f => f.kind === input.kind && (f.subject ?? null) === (input.subject ?? null))
  if (!form) return { ok: false, error: 'unknownForm' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.observedOn) || Number.isNaN(Date.parse(`${input.observedOn}T00:00:00Z`)) || input.observedOn > today) {
    return { ok: false, error: 'date' }
  }

  const values: Record<string, number | boolean | string> = {}
  for (const field of form.fields) {
    const raw = input.values?.[field.id]
    if (raw === undefined || raw === null || raw === '') continue
    if (field.type === 'number') {
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'))
      if (!Number.isFinite(n) || n < 0 || n > MAX_NUMBER) return { ok: false, error: 'value', field: field.id }
      values[field.id] = n
    } else if (field.type === 'boolean') {
      if (typeof raw !== 'boolean') return { ok: false, error: 'value', field: field.id }
      values[field.id] = raw
    } else {
      values[field.id] = String(raw).trim().slice(0, MAX_TEXT)
    }
  }
  // A form with fields needs at least one of them filled; a biofix is only its date.
  if (form.fields.length > 0 && Object.keys(values).length === 0) return { ok: false, error: 'noValues' }

  const notes = typeof input.notes === 'string' && input.notes.trim() !== '' ? input.notes.trim().slice(0, MAX_TEXT) : null
  return { ok: true, value: { kind: form.kind, subject: form.subject, observedOn: input.observedOn, values, notes } }
}
