'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { decideCalibration, type CalibrationDecision, type CalibrationsView } from '@/app/actions/calibrations'

/**
 * The learning loop's calibrated values: what is in force on top of the crop
 * pack, the challengers a calibration job has proposed with their backtest,
 * and the history. Only a farm admin promotes, rejects or rolls back.
 */
export default function Calibrations({ farmId, view, blockNames }: { farmId: string; view: CalibrationsView; blockNames: Record<string, string> }) {
  const t = useTranslations('recommendations.engine.calibrations')
  const locale = useLocale()
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso))

  if (view.status === 'unavailable') return <p className="text-xs text-amber-ink">{t('unavailable')}</p>
  if (view.scopes.length === 0) return <p className="text-xs text-ink-3">{t('empty')}</p>

  async function decide(id: string, decision: CalibrationDecision) {
    setPending(id + decision)
    setError(null)
    try {
      const res = await decideCalibration(farmId, id, decision)
      if (res.ok) router.refresh()
      else setError(t(`errors.${res.error}`))
    } catch {
      setError(t('errors.failed'))
    }
    setPending(null)
  }

  const button = 'flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink-2 hover:bg-tile disabled:opacity-60'

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-3">{view.canDecide ? t('intro') : t('adminOnly')}</p>
      {error && (
        <p role="alert" className="text-xs font-medium text-red">
          {error}
        </p>
      )}
      {view.scopes.map(s => (
        <div key={s.scope} className="space-y-2 rounded-lg bg-tile p-3 text-xs text-ink-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold text-ink" dir="ltr">
              {s.packId} · ${s.paramId}
            </p>
            <p className="text-ink-3">{s.blockId ? (blockNames[s.blockId] ?? s.blockId) : s.varietyId ? t('variety', { variety: s.varietyId }) : t('wholeFarm')}</p>
          </div>
          <p>
            {t('inForce')}: <span className="font-semibold text-ink">{s.inForce ? `${s.inForce.value} ${s.unit ?? ''}` : t('packValue', { value: `${s.packValue ?? '—'} ${s.unit ?? ''}` })}</span>
            {s.bounds && <span className="text-ink-3"> · {t('bounds', { low: s.bounds[0], high: s.bounds[1] })}</span>}
          </p>
          <ul className="divide-y divide-line/60">
            {s.history.map(c => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 break-words">
                  <span className="font-medium text-ink">
                    {c.value} {s.unit ?? ''}
                  </span>{' '}
                  · {t(`status.${c.status}`)} · {date(c.decidedAt ?? c.proposedAt)}
                  {c.backtest && <span className="text-ink-3"> · {t('backtest', { metric: c.backtest.metric, champion: c.backtest.champion, challenger: c.backtest.challenger, n: c.backtest.n })}</span>}
                  {c.method && <span className="text-ink-3"> · {c.method}</span>}
                  {c.refusal && <span className="text-amber-ink"> · {t(`refusals.${c.refusal}`)}</span>}
                </span>
                {view.canDecide && c.status === 'challenger' && (
                  <span className="flex shrink-0 gap-2">
                    {!c.refusal && (
                      <button type="button" disabled={pending !== null} onClick={() => decide(c.id, 'promoted')} className={button}>
                        {pending === c.id + 'promoted' && <Loader2 className="h-3 w-3 animate-spin" />}
                        {t('promote')}
                      </button>
                    )}
                    <button type="button" disabled={pending !== null} onClick={() => decide(c.id, 'rejected')} className={button}>
                      {pending === c.id + 'rejected' && <Loader2 className="h-3 w-3 animate-spin" />}
                      {t('reject')}
                    </button>
                  </span>
                )}
                {view.canDecide && s.inForce?.id === c.id && (
                  <button type="button" disabled={pending !== null} onClick={() => decide(c.id, 'rolled_back')} className={button}>
                    {pending === c.id + 'rolled_back' && <Loader2 className="h-3 w-3 animate-spin" />}
                    {t('rollback')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
