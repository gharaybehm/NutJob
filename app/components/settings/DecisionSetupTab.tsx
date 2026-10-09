'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Loader2, Save, Scale, Sprout } from 'lucide-react'
import { saveBlockDecisionSetup, saveFarmDecisionSetup, type SetupResult } from '@/app/actions/decision-setup'
import { FROST_METHODS, MAX_CANOPY_HEIGHT_M } from '@/utils/decision/setup'
import type { ProductOptions } from '@/utils/decision/pack-options'
import ProductLibrary, { type ProductRow } from './ProductLibrary'
import BlockPackLink from './BlockPackLink'
import type { InstalledPack } from '@/app/actions/block-pack'

/** The decision-engine columns of a farm_policy row, as stored. */
export interface DecisionFarmRow {
  price_per_yield_unit: number | string | null
  price_currency: string | null
  daily_labour_hours: number | string | null
  daily_water_m3: number | string | null
  sprayer_count: number | null
  frost_protection_method: string | null
}

/** The decision-engine columns of a block, as stored. */
export interface DecisionBlockRow {
  id: string
  name: string
  crop_type: string | null
  variety: string | null
  pack_id: string | null
  pack_version: string | null
  pack_variety_id: string | null
  canopy_cover_fraction: number | string | null
  canopy_height_m: number | string | null
  canopy_measured_on: string | null
  wetted_fraction: number | string | null
  expected_yield_kg_ha: number | string | null
  expected_yield_season: number | null
}

export interface DecisionSetupData {
  farm: DecisionFarmRow | null
  blocks: DecisionBlockRow[]
  products: ProductRow[]
  /** What a product can be listed against, from the crop packs the blocks are bound to. */
  productOptions: ProductOptions
  /** Only a farm admin writes and approves products, and links blocks to crop packs. */
  canEditProducts: boolean
  /** Every crop pack version the platform operator has installed. */
  installedPacks: InstalledPack[]
}

const INPUT =
  'w-full px-3 py-2 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-green transition placeholder:text-ink-4'

const text = (v: number | string | null | undefined) => (v === null || v === undefined ? '' : String(v))
/** A stored fraction as the percentage the form shows. */
const percent = (v: number | string | null | undefined) => (v === null || v === undefined || v === '' ? '' : String(Math.round(Number(v) * 100)))

type Status = { type: 'success' | 'error'; message: string } | null

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-ink-3 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-ink-4">{hint}</p>}
    </div>
  )
}

function SaveButton({ pending, status, onClick, label }: { pending: boolean; status: Status; onClick: () => void; label: string }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      {status && (
        <span role="status" className={`text-xs font-medium ${status.type === 'success' ? 'text-green' : 'text-red'}`}>
          {status.type === 'success' ? (
            <span className="flex items-center gap-1">
              <Check className="h-3 w-3" />
              {status.message}
            </span>
          ) : (
            status.message
          )}
        </span>
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-lg bg-green px-3 py-1.5 text-xs font-semibold text-white hover:brightness-105 disabled:opacity-60 transition-colors"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        {label}
      </button>
    </div>
  )
}

/** Runs a save and turns its result into the status line. */
function useSave() {
  const t = useTranslations('settings.decision')
  const [status, setStatus] = useState<Status>(null)
  const [pending, setPending] = useState(false)

  async function run(save: () => Promise<SetupResult>) {
    setPending(true)
    setStatus(null)
    try {
      const res = await save()
      setStatus(res.ok ? { type: 'success', message: t('saved') } : { type: 'error', message: t(`errors.${res.error}`) })
    } catch {
      setStatus({ type: 'error', message: t('errors.failed') })
    }
    setPending(false)
  }
  return { status, pending, run }
}

function FarmCard({ farmId, farm }: { farmId: string; farm: DecisionFarmRow | null }) {
  const t = useTranslations('settings.decision')
  const [price, setPrice] = useState(text(farm?.price_per_yield_unit))
  const [currency, setCurrency] = useState(farm?.price_currency ?? '')
  const [labour, setLabour] = useState(text(farm?.daily_labour_hours))
  const [water, setWater] = useState(text(farm?.daily_water_m3))
  const [sprayers, setSprayers] = useState(text(farm?.sprayer_count))
  const [frost, setFrost] = useState(farm?.frost_protection_method ?? '')
  const { status, pending, run } = useSave()

  const save = () =>
    run(() =>
      saveFarmDecisionSetup(farmId, {
        pricePerYieldUnit: price,
        priceCurrency: currency,
        dailyLabourHours: labour,
        dailyWaterM3: water,
        sprayerCount: sprayers,
        frostProtectionMethod: frost,
      }),
    )

  return (
    <div className="rounded-xl border border-line p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink flex items-center gap-2">
            <Scale className="h-4 w-4 text-green" />
            {t('farm.title')}
          </p>
          <p className="text-xs text-ink-3 mt-0.5">{t('farm.intro')}</p>
        </div>
        <SaveButton pending={pending} status={status} onClick={save} label={t('save')} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t('farm.price')} hint={t('farm.priceHint')}>
          <input type="number" min="0" step="0.01" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder={t('empty')} className={INPUT} />
        </Field>
        <Field label={t('farm.currency')} hint={t('farm.currencyHint')}>
          <input type="text" maxLength={3} value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} placeholder="TRY" dir="ltr" className={INPUT} />
        </Field>
        <Field label={t('farm.labour')} hint={t('farm.labourHint')}>
          <input type="number" min="0" step="1" inputMode="decimal" value={labour} onChange={e => setLabour(e.target.value)} placeholder={t('empty')} className={INPUT} />
        </Field>
        <Field label={t('farm.water')} hint={t('farm.waterHint')}>
          <input type="number" min="0" step="10" inputMode="decimal" value={water} onChange={e => setWater(e.target.value)} placeholder={t('empty')} className={INPUT} />
        </Field>
        <Field label={t('farm.sprayers')} hint={t('farm.sprayersHint')}>
          <input type="number" min="0" step="1" inputMode="numeric" value={sprayers} onChange={e => setSprayers(e.target.value)} placeholder={t('empty')} className={INPUT} />
        </Field>
        <Field label={t('farm.frostMethod')} hint={t('farm.frostMethodHint')}>
          <select value={frost} onChange={e => setFrost(e.target.value)} className={INPUT}>
            <option value="">{t('farm.frostMethods.none')}</option>
            {FROST_METHODS.map(m => (
              <option key={m} value={m}>
                {t(`farm.frostMethods.${m}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  )
}

function BlockCard({ farmId, block, season, packs, canLink }: { farmId: string; block: DecisionBlockRow; season: number; packs: InstalledPack[]; canLink: boolean }) {
  const t = useTranslations('settings.decision')
  const estimateIsCurrent = block.expected_yield_season === season
  const [cover, setCover] = useState(percent(block.canopy_cover_fraction))
  const [height, setHeight] = useState(text(block.canopy_height_m))
  const [measuredOn, setMeasuredOn] = useState(block.canopy_measured_on ?? '')
  const [wetted, setWetted] = useState(percent(block.wetted_fraction))
  const [expectedYield, setExpectedYield] = useState(estimateIsCurrent ? text(block.expected_yield_kg_ha) : '')
  const { status, pending, run } = useSave()

  const save = () =>
    run(() =>
      saveBlockDecisionSetup(block.id, {
        canopyCoverPct: cover,
        canopyHeightM: height,
        canopyMeasuredOn: measuredOn,
        wettedFractionPct: wetted,
        expectedYieldKgHa: expectedYield,
      }),
    )

  const binding = block.pack_id
    ? `${t('block.bound', { pack: block.pack_id, version: block.pack_version ?? '' })}, ${
        block.pack_variety_id ? t('block.variety', { variety: block.pack_variety_id }) : t('block.varietyNotInPack')
      }`
    : t('block.notBound')

  return (
    <div className="rounded-xl border border-line p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">{block.name}</p>
          <p className="text-xs text-ink-3 mt-0.5">{[block.crop_type, block.variety].filter(Boolean).join(' · ')}</p>
          <p className={`text-xs mt-0.5 ${block.pack_id ? 'text-ink-3' : 'text-amber-ink'}`}>{binding}</p>
        </div>
        <SaveButton pending={pending} status={status} onClick={save} label={t('save')} />
      </div>

      {packs.length > 0 && (
        <BlockPackLink
          key={`${block.pack_id}@${block.pack_version}@${block.pack_variety_id}`}
          farmId={farmId}
          blockId={block.id}
          current={{ packId: block.pack_id, version: block.pack_version, varietyId: block.pack_variety_id }}
          packs={packs}
          canEdit={canLink}
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label={t('block.canopyCover')} hint={t('block.canopyCoverHint')}>
          <input type="number" min="0" max="100" step="1" inputMode="decimal" value={cover} onChange={e => setCover(e.target.value)} placeholder={t('empty')} className={INPUT} />
        </Field>
        <Field label={t('block.canopyHeight')} hint={t('block.canopyHeightHint')}>
          <input type="number" min="0.1" max={MAX_CANOPY_HEIGHT_M} step="0.1" inputMode="decimal" value={height} onChange={e => setHeight(e.target.value)} placeholder={t('empty')} className={INPUT} />
        </Field>
        <Field label={t('block.measuredOn')} hint={t('block.measuredOnHint')}>
          <input type="date" value={measuredOn} onChange={e => setMeasuredOn(e.target.value)} className={INPUT} />
        </Field>
        <Field label={t('block.wetted')} hint={t('block.wettedHint')}>
          <input type="number" min="1" max="100" step="1" inputMode="decimal" value={wetted} onChange={e => setWetted(e.target.value)} placeholder={t('empty')} className={INPUT} />
        </Field>
        <Field
          label={t('block.yield')}
          hint={
            block.expected_yield_season !== null && !estimateIsCurrent
              ? `${t('block.yieldHint', { season })} ${t('block.yieldOtherSeason', { season: block.expected_yield_season })}`
              : t('block.yieldHint', { season })
          }
        >
          <input type="number" min="0" step="50" inputMode="decimal" value={expectedYield} onChange={e => setExpectedYield(e.target.value)} placeholder={t('empty')} className={INPUT} />
        </Field>
      </div>
    </div>
  )
}

export default function DecisionSetupTab({ farmId, data }: { farmId: string; data: DecisionSetupData | null }) {
  const t = useTranslations('settings.decision')
  const season = new Date().getFullYear()

  return (
    <section className="rounded-2xl bg-surface p-8 shadow-sm ring-1 ring-line">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
          <Sprout className="h-5 w-5 text-green" />
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-ink-3">{t('intro')}</p>
      </div>
      <div className="space-y-6">
        {data === null ? (
          <p className="text-sm text-amber-ink">{t('notAvailable')}</p>
        ) : (
          <>
            <FarmCard farmId={farmId} farm={data.farm} />
            <ProductLibrary farmId={farmId} products={data.products} options={data.productOptions} canEdit={data.canEditProducts} />
            <div>
              <p className="font-semibold text-ink">{t('block.title')}</p>
              <p className="text-xs text-ink-3 mt-0.5 mb-4">{t('block.intro')}</p>
              {data.blocks.length === 0 ? (
                <p className="text-sm text-ink-4">{t('block.none')}</p>
              ) : (
                <div className="space-y-4">
                  {data.blocks.map(b => (
                    <BlockCard key={b.id} farmId={farmId} block={b} season={season} packs={data.installedPacks} canLink={data.canEditProducts} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
