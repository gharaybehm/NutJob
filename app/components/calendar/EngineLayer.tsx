'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { itemsOnDate, localDateKey, type LayerItem, type LayerKind } from '@/utils/decision/calendar-layer'

/**
 * The decision engine's layer on the calendar: dashed pills, so they never
 * read as booked events. Read-only; work is booked from the Recommendations
 * page when a Live action is accepted.
 */

const KIND_STYLE: Record<LayerKind, string> = {
  planned: 'border-green/50 text-green',
  season_task: 'border-teal/50 text-teal-ink',
  reentry: 'border-amber/60 text-amber-ink',
  preharvest: 'border-amber/60 text-amber-ink',
  harvest_planned: 'border-brown/50 text-brown-ink',
  frost_night: 'border-blue/60 text-blue-ink',
}

function style(item: LayerItem): string {
  if (item.kind === 'frost_night' && (item.level === 'critical' || item.level === 'warning')) return 'border-red/60 text-red'
  if (item.kind === 'planned' && item.mode === 'shadow') return 'border-ink-4/50 text-ink-3'
  return KIND_STYLE[item.kind]
}

function useItemLabel() {
  const t = useTranslations('calendar.engine')
  return (item: LayerItem, blockNames: Record<string, string>) => {
    const block = blockNames[item.blockId] ?? item.blockId
    switch (item.kind) {
      case 'reentry':
        return t('reentry', { block })
      case 'preharvest':
        return t('preharvest', { block })
      case 'harvest_planned':
        return t('harvestPlanned', { block })
      case 'frost_night':
        return t('frostNight', { block, level: t(`levels.${item.level ?? 'watch'}`) })
      default:
        return `${block}: ${item.title}`
    }
  }
}

export function EngineDayItems({
  items,
  day,
  blockNames,
  onSelect,
  max = 2,
}: {
  items: LayerItem[]
  day: Date
  blockNames: Record<string, string>
  onSelect: (item: LayerItem) => void
  max?: number
}) {
  const label = useItemLabel()
  const onDay = itemsOnDate(items, localDateKey(day))
  if (onDay.length === 0) return null
  return (
    <div className="space-y-0.5">
      {onDay.slice(0, max).map(item => (
        <button
          key={item.id}
          type="button"
          onClick={e => {
            e.stopPropagation()
            onSelect(item)
          }}
          title={label(item, blockNames)}
          className={`flex w-full items-center rounded border border-dashed bg-surface px-1.5 py-0.5 text-start text-[11px] font-medium hover:bg-tile ${style(item)}`}
        >
          <span className="truncate">{label(item, blockNames)}</span>
        </button>
      ))}
      {onDay.length > max && <p className="ps-1 text-[11px] text-ink-4">+{onDay.length - max}</p>}
    </div>
  )
}

export function EngineItemPanel({ item, blockNames, farmId, onClose }: { item: LayerItem; blockNames: Record<string, string>; farmId: string; onClose: () => void }) {
  const t = useTranslations('calendar.engine')
  const locale = useLocale()
  const label = useItemLabel()
  const day = (d: string) => new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-md space-y-3 rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">{t(`kinds.${item.kind}`)}</p>
            <h2 className="mt-1 break-words font-heading text-base font-bold text-ink">{label(item, blockNames)}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t('close')} className="rounded-lg p-1 text-ink-3 hover:bg-tile">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-ink-2">{item.start === item.end ? day(item.start) : t('range', { from: day(item.start), to: day(item.end) })}</p>
        {item.title && item.kind === 'frost_night' && <p className="break-words text-sm text-ink-2">{item.title}</p>}
        {item.mode && <p className="text-xs text-ink-3">{item.mode === 'live' ? t('live') : t('shadow')}</p>}
        <p className="text-xs text-ink-4">{t('readOnly')}</p>
        <Link href={`/${farmId}/recommendations`} className="inline-block text-sm font-semibold text-green hover:underline">
          {t('openPlan')}
        </Link>
      </div>
    </div>
  )
}

export function EngineLayerToggle({ shown, onChange, count }: { shown: boolean; onChange: (v: boolean) => void; count: number }) {
  const t = useTranslations('calendar.engine')
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-ink-2">
      <input type="checkbox" checked={shown} onChange={e => onChange(e.target.checked)} className="h-4 w-4 rounded border-line accent-green" />
      {t('toggle', { count })}
    </label>
  )
}
