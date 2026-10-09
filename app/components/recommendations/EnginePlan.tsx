'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, ShieldAlert, Workflow } from 'lucide-react'
import { recordEngineDecision, setEngineMode, type EngineModeView, type EnginePlanView, type RecordedDecision } from '@/app/actions/engine-plan'
import { DECISION_REASONS, keyInputs, sprayProducts, type Decision, type DecisionReason, type StoredPlanEntry } from '@/utils/decision/plan-view'

const INPUT = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder-ink-4 focus:outline-none focus:ring-2 focus:ring-green'

/**
 * Engine ids and flags arrive as data, so their translation keys are built at
 * run time; an id with no translation is shown as it is.
 */
type LooseTranslator = { (key: string): string; has(key: string): boolean }
const engineName = (t: unknown, id: string) => ((t as LooseTranslator).has(`engines.${id}`) ? (t as LooseTranslator)(`engines.${id}`) : id)
const flagText = (t: unknown, flag: string) => ((t as LooseTranslator).has(`flags.${flag}`) ? (t as LooseTranslator)(`flags.${flag}`) : flag)

function Badge({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'neutral'; children: React.ReactNode }) {
  const tones = { green: 'bg-green-soft text-green', amber: 'bg-amber-soft text-amber-ink', red: 'bg-red-soft text-red', neutral: 'bg-tile text-ink-3' }
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}

/** A collapsed list: its heading with a count, opened on demand. */
function Fold({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-line">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start text-sm font-semibold text-ink-2">
        {title}
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-ink-4" /> : <ChevronDown className="h-4 w-4 shrink-0 text-ink-4" />}
      </button>
      {open && <div className="border-t border-line px-4 py-3">{children}</div>}
    </div>
  )
}

function DecisionControls({ farmId, entry, recorded }: { farmId: string; entry: StoredPlanEntry; recorded: RecordedDecision | undefined }) {
  const t = useTranslations('recommendations.engine.decision')
  const router = useRouter()
  /** The decision being entered; null when the buttons are showing. */
  const [draft, setDraft] = useState<Decision | null>(null)
  const [changing, setChanging] = useState(false)
  const [reason, setReason] = useState<DecisionReason | ''>('')
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!entry.logId) return <p className="text-xs text-ink-4">{t('noLog')}</p>

  async function save(decision: Decision) {
    setPending(true)
    setError(null)
    try {
      const res = await recordEngineDecision(farmId, entry.logId as string, { decision, reason, note })
      if (res.ok) {
        setDraft(null)
        setChanging(false)
        setReason('')
        setNote('')
        router.refresh()
      } else {
        setError(t(`errors.${res.error}`))
      }
    } catch {
      setError(t('errors.failed'))
    }
    setPending(false)
  }

  if (recorded && !changing) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={recorded.decision === 'accepted' ? 'green' : recorded.decision === 'edited' ? 'amber' : 'neutral'}>{t(recorded.decision)}</Badge>
        {recorded.reason && <span className="text-ink-3">{t(`reasons.${recorded.reason}`)}</span>}
        {recorded.note && <span className="text-ink-3 break-words">· {recorded.note}</span>}
        <button type="button" onClick={() => setChanging(true)} className="font-medium text-green hover:underline">
          {t('change')}
        </button>
      </div>
    )
  }

  if (draft === null) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-3">{entry.mode === 'live' ? t('promptLive') : t('promptShadow')}</span>
        <button type="button" disabled={pending} onClick={() => save('accepted')} className="rounded-lg bg-green px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:brightness-105 disabled:opacity-60">
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : t('accepted')}
        </button>
        <button type="button" disabled={pending} onClick={() => setDraft('edited')} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:bg-tile">
          {t('edited')}
        </button>
        <button type="button" disabled={pending} onClick={() => setDraft('skipped')} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:bg-tile">
          {t('skipped')}
        </button>
        {error && (
          <span role="alert" className="text-xs font-medium text-red">
            {error}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg bg-tile p-3">
      <p className="text-xs font-semibold text-ink-2">{t(draft)}</p>
      <label className="block text-xs font-semibold text-ink-3">
        {t('reason')}
        <select value={reason} onChange={e => setReason(e.target.value as DecisionReason | '')} className={`${INPUT} mt-1 font-normal`}>
          <option value="">{t('chooseReason')}</option>
          {DECISION_REASONS.map(r => (
            <option key={r} value={r}>
              {t(`reasons.${r}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-semibold text-ink-3">
        {draft === 'edited' ? t('noteEdited') : t('note')}
        <textarea rows={2} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} className={`${INPUT} mt-1 resize-none font-normal`} />
      </label>
      <div className="flex items-center justify-end gap-3">
        {error && (
          <span role="alert" className="text-xs font-medium text-red">
            {error}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            setDraft(null)
            setError(null)
          }}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-3 transition-colors hover:bg-surface"
        >
          {t('cancel')}
        </button>
        <button type="button" disabled={pending} onClick={() => save(draft)} className="flex items-center gap-1.5 rounded-lg bg-green px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:brightness-105 disabled:opacity-60">
          {pending && <Loader2 className="h-3 w-3 animate-spin" />}
          {t('save')}
        </button>
      </div>
    </div>
  )
}

function Why({ entry }: { entry: StoredPlanEntry }) {
  const t = useTranslations('recommendations.engine')
  const a = entry.action
  const inputs = keyInputs(a)
  const spray = sprayProducts(a)
  return (
    <div className="space-y-3 rounded-lg bg-tile p-3 text-xs text-ink-2">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        <div>
          <dt className="inline font-semibold text-ink-3">{t('why.rule')}: </dt>
          <dd className="inline" dir="ltr">
            {a.ruleId}
          </dd>
        </div>
        <div>
          <dt className="inline font-semibold text-ink-3">{t('why.pack')}: </dt>
          <dd className="inline" dir="ltr">
            {a.packId} {a.packVersion}
          </dd>
        </div>
        {a.evidence && (
          <div>
            <dt className="inline font-semibold text-ink-3">{t('why.source')}: </dt>
            <dd className="inline" dir="ltr">
              {a.evidence}
            </dd>
          </div>
        )}
        {a.expectedOutcome && (
          <div className="sm:col-span-2">
            <dt className="inline font-semibold text-ink-3">{t('why.expected')}: </dt>
            <dd className="inline">{a.expectedOutcome}</dd>
          </div>
        )}
      </dl>

      {inputs.length > 0 && (
        <div>
          <p className="font-semibold text-ink-3">{t('why.inputs')}</p>
          <ul className="mt-1 grid grid-cols-1 gap-x-4 sm:grid-cols-2" dir="ltr">
            {inputs.map(i => (
              <li key={i.key} className="flex justify-between gap-3 border-b border-line/60 py-0.5">
                <span className="text-ink-3">{i.key}</span>
                <span className="break-all text-end font-medium">{i.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {a.flags.length > 0 && (
        <div>
          <p className="font-semibold text-ink-3">{t('why.flags')}</p>
          <ul className="mt-1 list-disc space-y-0.5 ps-4">
            {a.flags.map(f => (
              <li key={f}>{flagText(t, f)}</li>
            ))}
          </ul>
        </div>
      )}

      {spray && (
        <div>
          <p className="font-semibold text-ink-3">{t('why.products')}</p>
          {spray.products.length === 0 ? (
            <p className="mt-1">{spray.note}</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {spray.products.map(p => (
                <li key={p.name}>
                  <span className="font-medium text-ink">{p.name}</span>:{' '}
                  {p.blocked.length > 0 ? (
                    // Safeguard findings are shown exactly as recorded.
                    <span className="text-red">{p.blocked.map(b => `${b.safeguardId}: ${b.reason}`).join('; ')}</span>
                  ) : p.openDays.length > 0 ? (
                    <span className="text-green">{t('why.productDays', { days: p.openDays.join(', ') })}</span>
                  ) : (
                    <span className="text-amber-ink">{t('why.productNoDay')}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function EntryCard({ farmId, entry, view, showDecision }: { farmId: string; entry: StoredPlanEntry; view: EnginePlanView; showDecision: boolean }) {
  const t = useTranslations('recommendations.engine')
  const [open, setOpen] = useState(false)
  const a = entry.action
  const notPlanned = entry.detail ?? entry.conflicts?.join('; ')
  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">
            {view.blockNames[entry.blockId] ?? entry.blockId} · {engineName(t, a.engineId)}
          </p>
          <p className="mt-1 break-words text-sm text-ink">{a.description}</p>
          {notPlanned && <p className="mt-1 break-words text-xs text-amber-ink">{notPlanned}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {a.mandatory && <Badge tone="red">{t('mandatory')}</Badge>}
          <Badge tone={entry.mode === 'live' ? 'green' : 'neutral'}>{entry.mode === 'live' ? t('live') : t('shadow')}</Badge>
          <span className="text-[11px] text-ink-4">{t('confidence', { value: Math.round(a.confidence * 100) })}</span>
        </div>
      </div>

      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex items-center gap-1 text-xs font-semibold text-green hover:underline">
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {t('why.title')}
      </button>
      {open && <Why entry={entry} />}

      {showDecision && <DecisionControls farmId={farmId} entry={entry} recorded={entry.logId ? view.decisions[entry.logId] : undefined} />}
    </div>
  )
}

function ModeRow({ farmId, mode }: { farmId: string; mode: EngineModeView }) {
  const t = useTranslations('recommendations.engine')
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    setPending(true)
    setError(null)
    const next = mode.mode === 'live' ? 'shadow' : 'live'
    try {
      const res = await setEngineMode(farmId, mode.packId, mode.engineId, next)
      if (res.ok) router.refresh()
      else setError(t(`modes.errors.${res.error}`))
    } catch {
      setError(t('modes.errors.failed'))
    }
    setPending(false)
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-ink">{engineName(t, mode.engineId)}</p>
        <p className="break-words text-xs text-ink-3" dir={mode.blockers.length > 0 ? 'ltr' : undefined}>
          {!mode.hasContent ? t('modes.inactive') : mode.blockers.length > 0 ? `${t('modes.waitingFor')} ${mode.blockers.join(', ')}` : t('modes.ready')}
        </p>
        {error && (
          <p role="alert" className="text-xs font-medium text-red">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge tone={mode.mode === 'live' ? 'green' : 'neutral'}>{mode.mode === 'live' ? t('live') : t('shadow')}</Badge>
        {(mode.canGoLive || mode.mode === 'live') && (
          <button type="button" disabled={pending} onClick={toggle} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:bg-tile disabled:opacity-60">
            {pending && <Loader2 className="h-3 w-3 animate-spin" />}
            {mode.mode === 'live' ? t('modes.toShadow') : t('modes.toLive')}
          </button>
        )}
      </div>
    </li>
  )
}

/**
 * The decision engine's plan for the farm: what it proposes for the next
 * seven days and why, what it left out, every safeguard check, and what each
 * engine is still waiting for. Texts of the actions are written by the
 * engine, in English.
 */
export default function EnginePlan({ farmId, view }: { farmId: string; view: EnginePlanView }) {
  const t = useTranslations('recommendations.engine')
  const locale = useLocale()
  if (view.status === 'forbidden') return null

  const dayLabel = (date: string) => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
  const dates = [...new Set(view.planned.map(p => p.date ?? ''))].sort()
  const descriptionOf = (actionId: string) => [...view.planned, ...view.deferred, ...view.unscheduledMandatory].find(e => e.actionId === actionId)?.action.description ?? actionId
  const anyLive = view.modes.some(m => m.mode === 'live')

  return (
    <section className="space-y-5 rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-line sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <Workflow className="h-5 w-5 text-green" />
            {t('title')}
          </h2>
          <p className="mt-1 text-sm text-ink-3">{anyLive ? t('introLive') : t('introShadow')}</p>
        </div>
        {view.planDate && (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge tone={view.planStatus === 'INFEASIBLE' ? 'red' : view.planStatus === 'FEASIBLE' ? 'amber' : 'green'}>{t(`planStatus.${view.planStatus ?? 'OPTIMAL'}`)}</Badge>
            <span className="text-xs text-ink-4">{t('planOf', { date: dayLabel(view.planDate) })}</span>
          </div>
        )}
      </div>

      {view.status === 'none' && <p className="text-sm text-ink-3">{t('none')}</p>}
      {view.status === 'unavailable' && <p className="text-sm text-amber-ink">{t('unavailable')}</p>}

      {view.status === 'ok' && (
        <>
          {view.unscheduledMandatory.length > 0 && (
            <div role="alert" className="space-y-3 rounded-xl border border-red/30 bg-red-soft p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-red">
                <ShieldAlert className="h-4 w-4" />
                {t('mandatoryNotPlanned')}
              </p>
              {view.unscheduledMandatory.map(e => (
                <EntryCard key={e.actionId} farmId={farmId} entry={e} view={view} showDecision={false} />
              ))}
            </div>
          )}

          {view.planned.length === 0 ? (
            <p className="text-sm text-ink-3">{t('nothingPlanned')}</p>
          ) : (
            dates.map(date => (
              <div key={date} className="space-y-3">
                <h3 className="text-sm font-semibold text-ink-2">{date ? dayLabel(date) : ''}</h3>
                {view.planned
                  .filter(p => (p.date ?? '') === date)
                  .map(e => (
                    <EntryCard key={e.actionId} farmId={farmId} entry={e} view={view} showDecision />
                  ))}
              </div>
            ))
          )}

          {view.deferred.length > 0 && (
            <Fold title={t('deferred', { count: view.deferred.length })}>
              <div className="space-y-3">
                {view.deferred.map(e => (
                  <EntryCard key={e.actionId} farmId={farmId} entry={e} view={view} showDecision={false} />
                ))}
              </div>
            </Fold>
          )}

          {view.safeguardEvents.length > 0 && (
            <Fold title={t('safeguards', { count: view.safeguardEvents.length })}>
              {/* Shown exactly as the safeguards recorded them. */}
              <ul className="space-y-1 text-xs text-ink-2">
                {view.safeguardEvents.map((v, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-ink" />
                    <span className="break-words">
                      <span className="font-semibold" dir="ltr">
                        {v.safeguardId}
                      </span>{' '}
                      · {t('dayNumber', { day: v.day })} · {v.reason} <span className="text-ink-4">({descriptionOf(v.actionId)})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Fold>
          )}

          {view.notes.length > 0 && (
            <ul className="list-disc space-y-0.5 ps-5 text-xs text-ink-3">
              {view.notes.map(n => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}

          {view.waiting.length > 0 && (
            <Fold title={t('waiting')}>
              <div className="space-y-3">
                {view.waiting.map(w => (
                  <div key={w.blockId}>
                    <p className="text-sm font-semibold text-ink">{view.blockNames[w.blockId] ?? w.blockId}</p>
                    <ul className="mt-1 space-y-1 text-xs text-ink-2">
                      {w.engines.map(e => (
                        <li key={e.engineId} className="break-words">
                          <span className="font-semibold">{engineName(t, e.engineId)}:</span> {e.notes.join(' · ')}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Fold>
          )}
        </>
      )}

      {view.modes.length > 0 && (
        <Fold title={t('modes.title')}>
          <p className="text-xs text-ink-3">{view.canSetModes ? t('modes.intro') : t('modes.adminOnly')}</p>
          <ul className="mt-2 divide-y divide-line">
            {view.modes.map(m =>
              view.canSetModes ? (
                <ModeRow key={`${m.packId}:${m.engineId}`} farmId={farmId} mode={m} />
              ) : (
                <li key={`${m.packId}:${m.engineId}`} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="text-ink">{engineName(t, m.engineId)}</span>
                  <Badge tone={m.mode === 'live' ? 'green' : 'neutral'}>{m.mode === 'live' ? t('live') : t('shadow')}</Badge>
                </li>
              ),
            )}
          </ul>
        </Fold>
      )}

      <p className="text-[11px] text-ink-4">{t('textNote')}</p>
    </section>
  )
}
