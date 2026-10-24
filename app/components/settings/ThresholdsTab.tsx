'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { Droplets, Info, Layers, Package, Snowflake, Thermometer } from 'lucide-react'
import type { ParameterStatus } from '@/engines/pack/schema'
import type { BlockThresholds, PackThresholds, PackValue, SoilSuggestion, ThresholdView } from '@/utils/alert-thresholds'

type Tone = 'green' | 'amber' | 'grey'

const TONE: Record<Tone, string> = {
  green: 'bg-green-soft text-green',
  amber: 'bg-amber-soft text-amber-ink',
  grey: 'bg-tile text-ink-3',
}

function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TONE[tone]}`}>{children}</span>
}

function Row({ label, value, hint, badge }: { label: string; value: React.ReactNode; hint?: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-line last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm text-ink">
          <span className="font-medium">{label}</span>
          <span className="text-ink-2">: {value}</span>
        </p>
        {hint && <p className="mt-0.5 text-[11px] text-ink-4">{hint}</p>}
      </div>
      {badge}
    </div>
  )
}

function Card({ title, icon: Icon, intro, children }: { title: string; icon: React.ElementType; intro?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-green shrink-0" />
        <p className="font-semibold text-ink">{title}</p>
      </div>
      {intro && <p className="mt-1 text-xs text-ink-3">{intro}</p>}
      <div className="mt-2">{children}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: ParameterStatus }) {
  const t = useTranslations('settings.thresholds')
  if (status === 'sourced') return <Badge tone="green">{t('status.sourced')}</Badge>
  if (status === 'expert estimate') return <Badge tone="amber">{t('status.expert')}</Badge>
  return <Badge tone="grey">{t('status.toBeSourced')}</Badge>
}

/** The soil-test suggestion for one block. With `onUse`, a button fills the block form (Block Config). */
export function SoilSuggestionNote({ soil, saved, onUse, used }: {
  soil: SoilSuggestion | null
  saved?: { fc: number | null; wp: number | null }
  onUse?: (fc: number, wp: number) => void
  used?: boolean
}) {
  const t = useTranslations('settings.thresholds')
  const format = useFormatter()
  if (!soil) return <p className="text-xs text-ink-4">{t('soil.none')}</p>
  const n = (v: number) => format.number(v, { maximumFractionDigits: 1 })
  const describe = [soil.textureClass, soil.scope === 'farm' ? t('soil.farmScope') : null].filter(Boolean).join(', ')
  const e = soil.estimate
  const differs = e.ok && saved && (saved.fc !== e.fieldCapacityPct || saved.wp !== e.wiltingPointPct)
  return (
    <div className="rounded-lg bg-tile px-3 py-2.5 space-y-1">
      <p className="text-xs font-semibold text-ink">
        {t('soil.test', { date: format.dateTime(new Date(soil.recordedAt), { dateStyle: 'medium' }) })}
        {describe && <span className="font-normal text-ink-3"> ({describe})</span>}
      </p>
      {e.ok ? (
        <>
          <p className="text-xs text-ink-2">{t('soil.suggests', { fc: n(e.fieldCapacityPct), wp: n(e.wiltingPointPct) })}</p>
          {differs && (
            <p className="text-[11px] text-ink-3">
              {t('soil.differs', {
                fc: saved.fc === null ? t('source.notSet') : `${n(saved.fc)} %`,
                wp: saved.wp === null ? t('source.notSet') : `${n(saved.wp)} %`,
              })}
            </p>
          )}
          <p className="text-[11px] text-ink-4">{t('soil.method')}</p>
          {onUse && differs && (
            <button type="button" onClick={() => onUse(e.fieldCapacityPct, e.wiltingPointPct)}
              className="mt-1 rounded-lg border border-green px-3 py-1 text-xs font-semibold text-green hover:bg-green-soft transition-colors">
              {t('soil.use')}
            </button>
          )}
          {used && <p role="status" className="text-xs font-medium text-green">{t('soil.used')}</p>}
        </>
      ) : (
        <p className="text-xs text-amber-ink">{t(`soil.reasons.${e.reason}`)}</p>
      )}
    </div>
  )
}

function FarmCard({ farm }: { farm: ThresholdView['farm'] }) {
  const t = useTranslations('settings.thresholds')
  const format = useFormatter()
  const origin = (isDefault: boolean) => <Badge tone={isDefault ? 'grey' : 'green'}>{t(isDefault ? 'source.default' : 'source.farm')}</Badge>
  const builtIn = <Badge tone="grey">{t('source.builtIn')}</Badge>
  return (
    <Card title={t('farm.title')} icon={Droplets} intro={t('editInBlockConfig')}>
      <Row label={t('farm.depletion')} value={format.number(farm.allowableDepletion.value, { maximumFractionDigits: 2 })}
        hint={t('farm.depletionHint')} badge={origin(farm.allowableDepletion.isDefault)} />
      <Row label={t('farm.frostMargin')} value={`${format.number(farm.frostMarginC.value)} °C`}
        hint={t('farm.frostMarginHint')} badge={origin(farm.frostMarginC.isDefault)} />
      <Row label={t('farm.sensorHours')} value={t('farm.hours', { n: farm.sensorFailedAfterHours.value })}
        hint={t('farm.sensorHoursHint')} badge={origin(farm.sensorFailedAfterHours.isDefault)} />
      <Row label={t('farm.effectiveRain')}
        value={t('farm.effectiveRainValue', { min: farm.effectiveRain.minMm, pct: Math.round(farm.effectiveRain.fraction * 100) })}
        hint={t('farm.effectiveRainHint')} badge={builtIn} />
      <Row label={t('farm.heat')} value={t('farm.heatValue', { temp: farm.heatFlagAboveC })} hint={t('farm.heatHint')} badge={builtIn} />
    </Card>
  )
}

function BlockCard({ block }: { block: BlockThresholds }) {
  const t = useTranslations('settings.thresholds')
  const format = useFormatter()
  const n = (v: number) => format.number(v, { maximumFractionDigits: 2 })
  const pct = (v: number | null) => (v === null ? t('source.notSet') : `${n(v)} %`)
  const blockBadge = (set: boolean) => <Badge tone={set ? 'green' : 'amber'}>{t(set ? 'source.block' : 'source.notSet')}</Badge>
  const rootBadge = block.rootDepth.from === 'block'
    ? <Badge tone="green">{t('source.block')}</Badge>
    : block.rootDepth.from === 'farm' ? <Badge tone="green">{t('source.farmDefault')}</Badge> : <Badge tone="amber">{t('source.notSet')}</Badge>
  return (
    <div className="rounded-xl border border-line p-5 space-y-3">
      <div>
        <p className="font-semibold text-ink">{block.name}</p>
        <p className="text-xs text-ink-3 mt-0.5">{[block.crop, block.variety].filter(Boolean).join(' · ')}</p>
      </div>
      <div>
        <Row label={t('block.fieldCapacity')} value={pct(block.fieldCapacityPct)} badge={blockBadge(block.fieldCapacityPct !== null)} />
        <Row label={t('block.wiltingPoint')} value={pct(block.wiltingPointPct)} badge={blockBadge(block.wiltingPointPct !== null)} />
        <Row label={t('block.rootDepth')} value={block.rootDepth.value === null ? t('source.notSet') : `${n(block.rootDepth.value)} m`} badge={rootBadge} />
      </div>
      <p className={`text-xs ${block.reserveMm === null ? 'text-amber-ink' : 'text-ink-2'}`}>
        {block.reserveMm === null || block.irrigateAtDepletionMm === null
          ? t('block.noReserve')
          : t('block.reserve', { reserve: block.reserveMm, trigger: block.irrigateAtDepletionMm })}
      </p>
      <SoilSuggestionNote soil={block.soil} saved={{ fc: block.fieldCapacityPct, wp: block.wiltingPointPct }} />
      <div>
        <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-3 uppercase tracking-wider">
          <Snowflake className="h-3.5 w-3.5" />{t('block.frostTitle')}
        </p>
        {block.frost === null || block.frost.length === 0 ? (
          <p className="mt-1 text-xs text-ink-4">{t('block.frostNone')}</p>
        ) : (
          <ul className="mt-1 space-y-1.5">
            {block.frost.map(f => (
              <li key={f.stage} className="text-xs text-ink-2">
                <span className="font-medium text-ink">{t(`block.frostStage.${f.stage}`)}</span>
                {': '}{t('block.frostValues', { lt10: n(f.lt10), warn: n(f.warningAtC) })}
                {f.lt90 !== null && <>{'; '}{t('block.frostLt90', { lt90: n(f.lt90) })}</>}
                <span className={`block text-[11px] ${f.basis === 'variety_tested' ? 'text-ink-4' : 'text-amber-ink'}`}>
                  {t(`block.basis.${f.basis}`)}. {f.source}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function PackCard({ pack }: { pack: PackThresholds }) {
  const t = useTranslations('settings.thresholds')
  const format = useFormatter()
  const statusBadge = (status: ParameterStatus) => <StatusBadge status={status} />
  const show = (v: PackValue | null) =>
    v === null ? t('pack.notGiven') : v.value === null ? t('status.toBeSourced') : `${format.number(v.value, { maximumFractionDigits: 2 })} ${v.unit}`
  const range = (v: PackValue | null) =>
    v?.bounds && v.bounds[0] !== v.bounds[1] ? t('pack.range', { min: format.number(v.bounds[0]), max: format.number(v.bounds[1]) }) : undefined
  return (
    <Card title={t('pack.title', { crop: pack.cropName, version: pack.version })} icon={Package} intro={t('pack.intro')}>
      <Row label={t('pack.depletion')} value={show(pack.depletion)} hint={range(pack.depletion)}
        badge={pack.depletion ? statusBadge(pack.depletion.status) : undefined} />
      {pack.depletionOutsideBounds && <p role="alert" className="py-1 text-xs text-red">{t('pack.outside')}</p>}
      <Row label={t('pack.rootDepth')} value={show(pack.rootDepth)} badge={pack.rootDepth ? statusBadge(pack.rootDepth.status) : undefined} />
      <Row label={t('pack.rainDefer')} value={show(pack.rainDeferProbability)} hint={range(pack.rainDeferProbability)}
        badge={pack.rainDeferProbability ? statusBadge(pack.rainDeferProbability.status) : undefined} />

      {pack.frostStages.length > 0 && (
        <div className="pt-3">
          <p className="text-xs font-semibold text-ink-3 uppercase tracking-wider">{t('pack.frost')}</p>
          {pack.frostStages.map(s => (
            <div key={s.name}>
              {s.critical.map((c, i) => (
                <Row key={i} label={s.name} value={show(c.temp)} badge={c.temp ? statusBadge(c.temp.status) : undefined}
                  hint={i === s.critical.length - 1 && s.varietiesWithOwnValues.length > 0 ? t('pack.varieties', { names: s.varietiesWithOwnValues.join(', ') }) : undefined} />
              ))}
            </div>
          ))}
        </div>
      )}

      {pack.pests.length > 0 && (
        <div className="pt-3">
          <p className="text-xs font-semibold text-ink-3 uppercase tracking-wider">{t('pack.pests')}</p>
          {pack.pests.flatMap(p =>
            p.events.map(e => (
              <Row key={`${p.name}-${e.name}`} label={`${p.name}, ${e.name}`} value={show(e.degreeDays)} hint={range(e.degreeDays)}
                badge={e.degreeDays ? statusBadge(e.degreeDays.status) : undefined} />
            )),
          )}
        </div>
      )}
    </Card>
  )
}

export default function ThresholdsTab({ view }: { view: ThresholdView | null }) {
  const t = useTranslations('settings.thresholds')
  if (!view) return <p className="text-sm text-amber-ink">{t('notAvailable')}</p>
  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-2">{t('intro')}</p>
      <FarmCard farm={view.farm} />

      <div className="space-y-3">
        <p className="flex items-center gap-2 font-semibold text-ink"><Layers className="h-4 w-4 text-green" />{t('block.title')}</p>
        {view.blocks.length === 0
          ? <p className="text-sm text-ink-4">{t('block.noBlocks')}</p>
          : view.blocks.map(b => <BlockCard key={b.id} block={b} />)}
      </div>

      {view.packs.length === 0
        ? <p className="text-sm text-ink-4">{t('pack.none')}</p>
        : view.packs.map(p => <PackCard key={p.key} pack={p} />)}

      <Card title={t('notAlerted.title')} icon={Thermometer}>
        <ul className="space-y-1.5 text-xs text-ink-2">
          {(['heat', 'pests', 'deficit'] as const).map(k => (
            <li key={k} className="flex items-start gap-2"><Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-ink-4" />{t(`notAlerted.${k}`)}</li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
