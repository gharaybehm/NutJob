'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { getPackDiff, setBlockPack, type InstalledPack } from '@/app/actions/block-pack'
import { newerVersion, type PackDiff } from '@/engines/pack/diff'

const INPUT =
  'w-full px-3 py-2 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-green transition placeholder:text-ink-4'

const key = (p: { packId: string; version: string }) => `${p.packId}@${p.version}`

/**
 * Which crop pack, version and variety a block uses. Packs are installed by
 * the platform operator; choosing one for a block, and moving a block to a
 * new version after seeing what changed, is the farm admin's decision.
 */
export default function BlockPackLink({
  farmId,
  blockId,
  current,
  packs,
  canEdit,
}: {
  farmId: string
  blockId: string
  current: { packId: string | null; version: string | null; varietyId: string | null }
  packs: InstalledPack[]
  canEdit: boolean
}) {
  const t = useTranslations('settings.decision.link')
  const router = useRouter()
  const [selected, setSelected] = useState(current.packId && current.version ? key({ packId: current.packId, version: current.version }) : '')
  const [variety, setVariety] = useState(current.varietyId ?? '')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [diff, setDiff] = useState<PackDiff | 'loading' | 'unavailable' | null>(null)

  const chosen = packs.find(p => key(p) === selected) ?? null
  // The newest installed version of the pack the block is on, when it is newer than the block's own.
  const newer =
    current.packId && current.version
      ? packs.filter(p => p.packId === current.packId && newerVersion(p.version, current.version as string)).sort((a, b) => (newerVersion(a.version, b.version) ? -1 : 1))[0] ?? null
      : null

  async function save(packKey: string, varietyId: string) {
    setPending(true)
    setMessage(null)
    const pack = packs.find(p => key(p) === packKey) ?? null
    try {
      const res = await setBlockPack(blockId, { packId: pack?.packId ?? null, version: pack?.version ?? null, varietyId: pack && varietyId !== '' ? varietyId : null })
      if (res.ok) {
        setMessage({ type: 'success', text: t('saved') })
        setDiff(null)
        router.refresh()
      } else {
        setMessage({ type: 'error', text: t(`errors.${res.error}`) })
      }
    } catch {
      setMessage({ type: 'error', text: t('errors.failed') })
    }
    setPending(false)
  }

  async function showDiff() {
    if (!newer || !current.packId || !current.version) return
    setDiff('loading')
    try {
      setDiff((await getPackDiff(farmId, current.packId, current.version, newer.version)) ?? 'unavailable')
    } catch {
      setDiff('unavailable')
    }
  }

  return (
    <div className="space-y-3 rounded-lg bg-tile p-3">
      {newer && (
        <div className="space-y-2 rounded-lg border border-amber/30 bg-amber-soft p-3 text-xs text-amber-ink">
          <p className="font-semibold">{t('newer', { version: newer.version, current: current.version ?? '' })}</p>
          {diff === null && (
            <button type="button" onClick={showDiff} className="font-semibold underline underline-offset-2">
              {t('seeChanges')}
            </button>
          )}
          {diff === 'loading' && (
            <p className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('loading')}
            </p>
          )}
          {diff === 'unavailable' && <p>{t('diffUnavailable')}</p>}
          {diff !== null && typeof diff === 'object' && (
            <ul className="list-disc space-y-0.5 ps-4 text-ink-2">
              {diff.identical && <li>{t('diff.identical')}</li>}
              {diff.sections.length > 0 && (
                <li>
                  {t('diff.sections')} <span dir="ltr">{diff.sections.join(', ')}</span>
                </li>
              )}
              {diff.parameters.changed.map(c => (
                <li key={`${c.id}:${c.field}`} dir="ltr">
                  ${c.id} ({c.field}): {c.from} → {c.to}
                </li>
              ))}
              {diff.parameters.added.length > 0 && (
                <li>
                  {t('diff.valuesAdded')} <span dir="ltr">{diff.parameters.added.join(', ')}</span>
                </li>
              )}
              {diff.parameters.removed.length > 0 && (
                <li>
                  {t('diff.valuesRemoved')} <span dir="ltr">{diff.parameters.removed.join(', ')}</span>
                </li>
              )}
              {diff.tables.map(tb => (
                <li key={tb.table}>
                  {t('diff.table')} <span dir="ltr">{tb.table}: {[...tb.rowsAdded.map(r => `+${r}`), ...tb.rowsRemoved.map(r => `−${r}`), ...tb.rowsChanged.map(r => `~${r}`)].join(', ')}</span>
                </li>
              ))}
              {[...diff.tablesAdded.map(x => `+${x}`), ...diff.tablesRemoved.map(x => `−${x}`)].length > 0 && (
                <li>
                  {t('diff.tables')} <span dir="ltr">{[...diff.tablesAdded.map(x => `+${x}`), ...diff.tablesRemoved.map(x => `−${x}`)].join(', ')}</span>
                </li>
              )}
            </ul>
          )}
          {canEdit && diff !== null && typeof diff === 'object' && (
            <button
              type="button"
              disabled={pending}
              onClick={() => save(key(newer), newer.varieties.some(v => v.id === current.varietyId) ? (current.varietyId as string) : '')}
              className="flex items-center gap-1.5 rounded-lg bg-green px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:brightness-105 disabled:opacity-60"
            >
              {pending && <Loader2 className="h-3 w-3 animate-spin" />}
              {t('moveTo', { version: newer.version })}
            </button>
          )}
          {!canEdit && <p>{t('adminMoves')}</p>}
        </div>
      )}

      {canEdit && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3">
            {t('pack')}
            <select
              value={selected}
              onChange={e => {
                setSelected(e.target.value)
                setVariety('')
              }}
              className={`${INPUT} mt-1.5 font-normal normal-case tracking-normal`}
            >
              <option value="">{t('noPack')}</option>
              {packs.map(p => (
                <option key={key(p)} value={key(p)}>
                  {p.cropName} · {p.packId} {p.version}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3">
            {t('variety')}
            <select value={variety} onChange={e => setVariety(e.target.value)} disabled={!chosen} className={`${INPUT} mt-1.5 font-normal normal-case tracking-normal disabled:opacity-60`}>
              <option value="">{t('varietyNotListed')}</option>
              {(chosen?.varieties ?? []).map(v => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => save(selected, variety)}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-2 transition-colors hover:bg-tile disabled:opacity-60"
          >
            {pending && <Loader2 className="h-3 w-3 animate-spin" />}
            {t('save')}
          </button>
        </div>
      )}
      {message && (
        <p role="status" className={`text-xs font-medium ${message.type === 'success' ? 'text-green' : 'text-red'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}
