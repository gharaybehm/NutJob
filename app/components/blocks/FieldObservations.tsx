'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ClipboardList, Loader2, Trash2 } from 'lucide-react'
import {
  deleteFieldObservation,
  getObservationForms,
  logFieldObservation,
  type FieldObservationRow,
  type ObservationFormsResult,
} from '@/app/actions/field-observations'
import { BIOFIX_KIND, HIVES_KIND, type ObservationForm } from '@/engines/pack/forms'

const INPUT =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder-ink-4 focus:outline-none focus:ring-2 focus:ring-green'

const formKey = (f: { kind: string; subject: string | null }) => `${f.kind}|${f.subject ?? ''}`
/** A pack id as words, for kinds and fields the pack gives no label. */
const words = (id: string) => id.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())

/**
 * Field observations for one block: the forms its crop pack asks for (trap
 * checks, counts, hull split, hives, an observed biofix) and what was
 * recorded lately. Field labels come from the pack, in the pack's language.
 */
export default function FieldObservations({ blockId }: { blockId: string }) {
  const t = useTranslations('blocks.observations')
  const today = new Date().toISOString().slice(0, 10)
  const [data, setData] = useState<ObservationFormsResult | null>(null)
  const [selected, setSelected] = useState('')
  const [observedOn, setObservedOn] = useState(today)
  const [entries, setEntries] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const result = await getObservationForms(blockId)
      setData(result)
      setSelected(current => (result.forms.some(f => formKey(f) === current) ? current : result.forms[0] ? formKey(result.forms[0]) : ''))
    } catch {
      setData({ status: 'unavailable', forms: [], recent: [], canDelete: false })
    }
  }, [blockId])

  // The parent gives this component a key per block, so a different block starts from a clean state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of this block's forms and observations
    void load()
  }, [load])

  const kindLabel = (f: { kind: string; subject: string | null; subjectName?: string | null }, forms: ObservationForm[]) => {
    const kind = f.kind === BIOFIX_KIND ? t('kinds.biofix') : f.kind === HIVES_KIND ? t('kinds.hives') : words(f.kind)
    const subjectName = f.subjectName ?? forms.find(x => x.subject === f.subject && x.subjectName)?.subjectName ?? f.subject
    return subjectName ? `${kind}: ${subjectName}` : kind
  }

  async function save(form: ObservationForm) {
    setSaving(true)
    setMessage(null)
    const values: Record<string, unknown> = {}
    for (const field of form.fields) {
      const raw = entries[field.id] ?? ''
      if (raw === '') continue
      values[field.id] = field.type === 'boolean' ? raw === 'yes' : raw
    }
    try {
      const res = await logFieldObservation(blockId, { kind: form.kind, subject: form.subject, observedOn, values, notes })
      if (res.ok) {
        setEntries({})
        setNotes('')
        setMessage({ type: 'success', text: t('saved') })
        await load()
      } else {
        setMessage({ type: 'error', text: t(`errors.${res.error}`) })
      }
    } catch {
      setMessage({ type: 'error', text: t('errors.failed') })
    }
    setSaving(false)
  }

  async function remove(row: FieldObservationRow) {
    if (!window.confirm(t('confirmDelete'))) return
    const res = await deleteFieldObservation(blockId, row.id)
    if (res.ok) await load()
    else setMessage({ type: 'error', text: t('errors.failed') })
  }

  const summary = (row: FieldObservationRow) => {
    if (row.kind === BIOFIX_KIND) return t('biofixRecorded')
    if (row.kind === HIVES_KIND) return row.values.present === true ? t('hivesYes') : t('hivesNo')
    return Object.entries(row.values)
      .map(([k, v]) => `${words(k)} ${String(v)}`)
      .join(' · ')
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-2">
        <ClipboardList className="h-4 w-4 text-green" />
        {t('title')}
      </h3>
      <p className="mt-1 text-xs text-ink-3">{t('intro')}</p>

      {data === null ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </p>
      ) : data.status !== 'ok' ? (
        <p className="mt-3 text-sm text-amber-ink">{t(`status.${data.status}`)}</p>
      ) : (
        (() => {
          const form = data.forms.find(f => formKey(f) === selected) ?? null
          return (
            <div className="mt-3 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3">
                  {t('form')}
                  <select
                    value={selected}
                    onChange={e => {
                      setSelected(e.target.value)
                      setEntries({})
                      setMessage(null)
                    }}
                    className={`${INPUT} mt-1.5 font-normal normal-case tracking-normal`}
                  >
                    {data.forms.map(f => (
                      <option key={formKey(f)} value={formKey(f)}>
                        {kindLabel(f, data.forms)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3">
                  {form?.kind === BIOFIX_KIND ? t('biofixDate') : t('date')}
                  <input type="date" max={today} value={observedOn} onChange={e => setObservedOn(e.target.value)} className={`${INPUT} mt-1.5 font-normal normal-case tracking-normal`} />
                </label>
              </div>

              {form && form.kind === BIOFIX_KIND && <p className="text-xs text-ink-3">{t('biofixHint')}</p>}

              {form && form.fields.length > 0 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {form.fields.map(field => {
                    const label = form.kind === HIVES_KIND ? t('hivesPresent') : field.label ?? words(field.id)
                    return (
                      <label key={field.id} className="block text-xs font-semibold uppercase tracking-wider text-ink-3">
                        {label}
                        {field.type === 'boolean' ? (
                          <select value={entries[field.id] ?? ''} onChange={e => setEntries(s => ({ ...s, [field.id]: e.target.value }))} className={`${INPUT} mt-1.5 font-normal normal-case tracking-normal`}>
                            <option value="">{t('choose')}</option>
                            <option value="yes">{t('yes')}</option>
                            <option value="no">{t('no')}</option>
                          </select>
                        ) : (
                          <input
                            type={field.type === 'number' ? 'number' : 'text'}
                            min={field.type === 'number' ? 0 : undefined}
                            step="any"
                            inputMode={field.type === 'number' ? 'decimal' : undefined}
                            value={entries[field.id] ?? ''}
                            onChange={e => setEntries(s => ({ ...s, [field.id]: e.target.value }))}
                            className={`${INPUT} mt-1.5 font-normal normal-case tracking-normal`}
                          />
                        )}
                      </label>
                    )
                  })}
                </div>
              )}

              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3">
                {t('notes')}
                <textarea rows={2} maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} className={`${INPUT} mt-1.5 resize-none font-normal normal-case tracking-normal`} />
              </label>

              <div className="flex items-center justify-end gap-3">
                {message && (
                  <span role="status" className={`text-xs font-medium ${message.type === 'success' ? 'text-green' : 'text-red'}`}>
                    {message.text}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => form && save(form)}
                  disabled={saving || !form}
                  className="flex items-center gap-1.5 rounded-lg bg-green px-4 py-2 text-sm font-semibold text-white transition-colors hover:brightness-105 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('save')}
                </button>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-3">{t('recent')}</h4>
                {data.recent.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-4">{t('none')}</p>
                ) : (
                  <ul className="mt-2 divide-y divide-line">
                    {data.recent.map(row => (
                      <li key={row.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="text-ink-2">
                            <span className="font-medium text-ink">{row.observedOn}</span> · {kindLabel(row, data.forms)}
                          </p>
                          <p className="text-xs text-ink-3 break-words">{[summary(row), row.notes].filter(Boolean).join(' · ')}</p>
                        </div>
                        {data.canDelete && (
                          <button type="button" onClick={() => remove(row)} aria-label={t('delete')} className="shrink-0 rounded-lg p-1.5 text-ink-4 transition-colors hover:bg-red-soft hover:text-red">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )
        })()
      )}
    </section>
  )
}
