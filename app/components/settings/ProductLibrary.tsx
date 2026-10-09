'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, Check, FlaskConical, Loader2, Pencil, Plus, ShieldCheck, Trash2, X } from 'lucide-react'
import { approveFarmProduct, deleteFarmProduct, saveFarmProduct, type ProductResult } from '@/app/actions/farm-products'
import { missingLabelValues, PRODUCT_TYPES, type ProductInput, type ProductType } from '@/utils/decision/products'
import type { ProductOptions } from '@/utils/decision/pack-options'

/** A farm_products row, as stored. */
export interface ProductRow {
  id: string
  name: string
  product_type: ProductType
  active_ingredient: string | null
  mode_of_action_group: string | null
  targets: string[] | null
  registered_crops: string[] | null
  registration_number: string | null
  max_wind_ms: number | string | null
  min_wind_ms: number | string | null
  rainfast_hours: number | string | null
  phi_days: number | null
  rei_hours: number | string | null
  max_applications_per_season: number | null
  bee_toxic: boolean | null
  nutrient_content: Record<string, number> | null
  notes: string | null
  approved_at: string | null
}

const INPUT =
  'w-full px-3 py-2 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-green transition placeholder:text-ink-4'
const NUTRIENTS = ['N', 'P', 'K'] as const

const text = (v: number | string | null | undefined) => (v === null || v === undefined ? '' : String(v))
const num = (v: number | string | null) => (v === null || v === '' ? null : Number(v))

/** The stored row in the shape the checks on label values read. */
function asInput(p: ProductRow): Pick<ProductInput, 'productType'> & Partial<ProductInput> {
  return {
    productType: p.product_type,
    maxWindMs: num(p.max_wind_ms),
    minWindMs: num(p.min_wind_ms),
    rainfastHours: num(p.rainfast_hours),
    phiDays: p.phi_days,
    reiHours: num(p.rei_hours),
    maxApplicationsPerSeason: p.max_applications_per_season,
    beeToxic: p.bee_toxic,
    registeredCrops: p.registered_crops ?? [],
  }
}

interface FormState {
  name: string
  productType: ProductType
  activeIngredient: string
  modeOfActionGroup: string
  targets: string[]
  registeredCrops: string[]
  registrationNumber: string
  maxWindMs: string
  minWindMs: string
  rainfastHours: string
  phiDays: string
  reiHours: string
  maxApplicationsPerSeason: string
  beeToxic: '' | 'yes' | 'no'
  nutrients: Record<string, string>
  notes: string
}

function initial(p: ProductRow | null): FormState {
  return {
    name: p?.name ?? '',
    productType: p?.product_type ?? 'fungicide',
    activeIngredient: p?.active_ingredient ?? '',
    modeOfActionGroup: p?.mode_of_action_group ?? '',
    targets: p?.targets ?? [],
    registeredCrops: p?.registered_crops ?? [],
    registrationNumber: p?.registration_number ?? '',
    maxWindMs: text(p?.max_wind_ms),
    minWindMs: text(p?.min_wind_ms),
    rainfastHours: text(p?.rainfast_hours),
    phiDays: text(p?.phi_days),
    reiHours: text(p?.rei_hours),
    maxApplicationsPerSeason: text(p?.max_applications_per_season),
    beeToxic: p?.bee_toxic === true ? 'yes' : p?.bee_toxic === false ? 'no' : '',
    nutrients: Object.fromEntries(NUTRIENTS.map(n => [n, text(p?.nutrient_content?.[n])])),
    notes: p?.notes ?? '',
  }
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-ink-3 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-ink-4">{hint}</p>}
    </div>
  )
}

function Checks({ options, selected, onChange, empty }: { options: { id: string; name: string }[]; selected: string[]; onChange: (next: string[]) => void; empty: string }) {
  if (options.length === 0) return <p className="text-xs text-ink-4">{empty}</p>
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {options.map(o => (
        <label key={o.id} className="flex items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={selected.includes(o.id)}
            onChange={e => onChange(e.target.checked ? [...selected, o.id] : selected.filter(x => x !== o.id))}
            className="h-4 w-4 rounded border-line text-green focus:ring-green"
          />
          {o.name}
        </label>
      ))}
    </div>
  )
}

function ProductForm({ farmId, product, options, onDone }: { farmId: string; product: ProductRow | null; options: ProductOptions; onDone: () => void }) {
  const t = useTranslations('settings.decision.products')
  const [f, setF] = useState<FormState>(() => initial(product))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setF(s => ({ ...s, [key]: value }))
  const sprayed = f.productType !== 'fertiliser'

  async function save() {
    setPending(true)
    setError(null)
    let res: ProductResult
    try {
      res = await saveFarmProduct(farmId, product?.id ?? null, {
        ...f,
        beeToxic: f.beeToxic === '' ? null : f.beeToxic === 'yes',
        nutrientContent: f.nutrients,
      })
    } catch {
      res = { ok: false, error: 'failed' }
    }
    setPending(false)
    if (res.ok) onDone()
    else setError(t(`errors.${res.error}`))
  }

  return (
    <div className="rounded-xl border border-green/30 bg-tile p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-ink">{product ? t('edit') : t('add')}</p>
        <button type="button" onClick={onDone} aria-label={t('cancel')} className="rounded-lg p-1.5 text-ink-4 hover:bg-surface hover:text-ink-2 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
      {product?.approved_at && <p className="text-xs text-amber-ink">{t('editClearsApproval')}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t('name')}>
          <input type="text" maxLength={120} value={f.name} onChange={e => set('name', e.target.value)} className={INPUT} />
        </Field>
        <Field label={t('type')}>
          <select value={f.productType} onChange={e => set('productType', e.target.value as ProductType)} className={INPUT}>
            {PRODUCT_TYPES.map(type => (
              <option key={type} value={type}>
                {t(`types.${type}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('activeIngredient')}>
          <input type="text" maxLength={200} value={f.activeIngredient} onChange={e => set('activeIngredient', e.target.value)} className={INPUT} />
        </Field>
        {sprayed && (
          <Field label={t('modeOfAction')} hint={t('modeOfActionHint')}>
            <input type="text" maxLength={20} value={f.modeOfActionGroup} onChange={e => set('modeOfActionGroup', e.target.value)} dir="ltr" className={INPUT} />
          </Field>
        )}
      </div>

      {sprayed ? (
        <>
          <Field label={t('targets')} hint={t('targetsHint')}>
            <Checks options={options.targets} selected={f.targets} onChange={v => set('targets', v)} empty={t('noTargets')} />
          </Field>
          <Field label={t('registeredCrops')} hint={t('registeredCropsHint')}>
            <Checks options={options.crops} selected={f.registeredCrops} onChange={v => set('registeredCrops', v)} empty={t('noCrops')} />
          </Field>
          <p className="text-xs text-ink-3">{t('labelIntro')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label={t('registrationNumber')}>
              <input type="text" maxLength={60} value={f.registrationNumber} onChange={e => set('registrationNumber', e.target.value)} dir="ltr" className={INPUT} />
            </Field>
            <Field label={t('maxWind')} hint="SG-SPR-1">
              <input type="number" min="0" step="0.5" inputMode="decimal" value={f.maxWindMs} onChange={e => set('maxWindMs', e.target.value)} className={INPUT} />
            </Field>
            <Field label={t('minWind')} hint={`SG-SPR-2. ${t('minWindHint')}`}>
              <input type="number" min="0" step="0.1" inputMode="decimal" value={f.minWindMs} onChange={e => set('minWindMs', e.target.value)} className={INPUT} />
            </Field>
            <Field label={t('rainfast')} hint="SG-SPR-3">
              <input type="number" min="0" step="1" inputMode="decimal" value={f.rainfastHours} onChange={e => set('rainfastHours', e.target.value)} className={INPUT} />
            </Field>
            <Field label={t('phi')} hint="SG-SPR-4">
              <input type="number" min="0" step="1" inputMode="numeric" value={f.phiDays} onChange={e => set('phiDays', e.target.value)} className={INPUT} />
            </Field>
            <Field label={t('rei')} hint="SG-SPR-5">
              <input type="number" min="0" step="1" inputMode="decimal" value={f.reiHours} onChange={e => set('reiHours', e.target.value)} className={INPUT} />
            </Field>
            <Field label={t('maxApplications')} hint="SG-SPR-6">
              <input type="number" min="0" step="1" inputMode="numeric" value={f.maxApplicationsPerSeason} onChange={e => set('maxApplicationsPerSeason', e.target.value)} className={INPUT} />
            </Field>
            <Field label={t('beeToxic')} hint="SG-SPR-8">
              <select value={f.beeToxic} onChange={e => set('beeToxic', e.target.value as FormState['beeToxic'])} className={INPUT}>
                <option value="">{t('notRecorded')}</option>
                <option value="yes">{t('yes')}</option>
                <option value="no">{t('no')}</option>
              </select>
            </Field>
          </div>
        </>
      ) : (
        <Field label={t('nutrients')} hint={t('nutrientsHint')}>
          <div className="flex flex-wrap gap-3">
            {NUTRIENTS.map(n => (
              <label key={n} className="flex items-center gap-2 text-sm text-ink-2">
                <span className="font-semibold">{n}</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  inputMode="decimal"
                  value={f.nutrients[n] ?? ''}
                  onChange={e => set('nutrients', { ...f.nutrients, [n]: e.target.value })}
                  className={`${INPUT} !w-24`}
                />
                <span className="text-xs text-ink-3">%</span>
              </label>
            ))}
          </div>
        </Field>
      )}

      <Field label={t('notes')}>
        <textarea rows={2} maxLength={1000} value={f.notes} onChange={e => set('notes', e.target.value)} className={`${INPUT} resize-none`} />
      </Field>

      <div className="flex items-center justify-end gap-3">
        {error && (
          <span role="alert" className="text-xs font-medium text-red">
            {error}
          </span>
        )}
        <button type="button" onClick={onDone} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-3 hover:bg-surface transition-colors">
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="flex items-center gap-1.5 rounded-lg bg-green px-3 py-1.5 text-xs font-semibold text-white hover:brightness-105 disabled:opacity-60 transition-colors"
        >
          {pending && <Loader2 className="h-3 w-3 animate-spin" />}
          {t('save')}
        </button>
      </div>
    </div>
  )
}

function ProductItem({ farmId, product, options, canEdit, onEdit }: { farmId: string; product: ProductRow; options: ProductOptions; canEdit: boolean; onEdit: () => void }) {
  const t = useTranslations('settings.decision.products')
  const [pending, setPending] = useState<'approve' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const missing = missingLabelValues(asInput(product))
  const targetNames = (product.targets ?? []).map(id => options.targets.find(o => o.id === id)?.name ?? id)

  async function act(kind: 'approve' | 'delete') {
    if (kind === 'delete' && !window.confirm(t('confirmDelete', { name: product.name }))) return
    setPending(kind)
    setError(null)
    const res = kind === 'approve' ? await approveFarmProduct(farmId, product.id) : await deleteFarmProduct(farmId, product.id)
    setPending(null)
    if (!res.ok) setError(t(`errors.${res.error}`))
  }

  return (
    <div className="rounded-xl border border-line p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ink break-words">{product.name}</p>
          <p className="text-xs text-ink-3 mt-0.5">
            {[t(`types.${product.product_type}`), product.active_ingredient, product.mode_of_action_group ? t('group', { group: product.mode_of_action_group }) : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${product.approved_at ? 'bg-green-soft text-green' : 'bg-amber-soft text-amber-ink'}`}>
          {product.approved_at ? t('approved') : t('notApproved')}
        </span>
      </div>

      {product.product_type !== 'fertiliser' && <p className="text-xs text-ink-2">{targetNames.length > 0 ? t('usedAgainst', { targets: targetNames.join(', ') }) : t('noTargetsListed')}</p>}

      {missing.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-amber-ink">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{t('missing', { safeguards: missing.map(m => m.safeguardId).join(', ') })}</span>
        </p>
      )}
      {!product.approved_at && missing.length === 0 && product.product_type !== 'fertiliser' && <p className="text-xs text-ink-3">{t('needsApproval')}</p>}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {!product.approved_at && (
            <button
              type="button"
              onClick={() => act('approve')}
              disabled={pending !== null}
              className="flex items-center gap-1.5 rounded-lg bg-green px-3 py-1.5 text-xs font-semibold text-white hover:brightness-105 disabled:opacity-60 transition-colors"
            >
              {pending === 'approve' ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
              {t('approve')}
            </button>
          )}
          <button type="button" onClick={onEdit} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-tile transition-colors">
            <Pencil className="h-3 w-3" />
            {t('editButton')}
          </button>
          <button
            type="button"
            onClick={() => act('delete')}
            disabled={pending !== null}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-red hover:bg-red-soft disabled:opacity-60 transition-colors"
          >
            {pending === 'delete' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            {t('delete')}
          </button>
          {error && (
            <span role="alert" className="text-xs font-medium text-red">
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default function ProductLibrary({ farmId, products, options, canEdit }: { farmId: string; products: ProductRow[]; options: ProductOptions; canEdit: boolean }) {
  const t = useTranslations('settings.decision.products')
  /** The product being edited, 'new' for a new one, or null when no form is open. */
  const [editing, setEditing] = useState<string | 'new' | null>(null)

  return (
    <div className="rounded-xl border border-line p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-green" />
            {t('title')}
          </p>
          <p className="text-xs text-ink-3 mt-0.5">{t('intro')}</p>
        </div>
        {canEdit && editing === null && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-green px-3 py-1.5 text-xs font-semibold text-white hover:brightness-105 transition-colors"
          >
            <Plus className="h-3 w-3" />
            {t('add')}
          </button>
        )}
      </div>
      {!canEdit && (
        <p className="flex items-center gap-1.5 text-xs text-ink-3">
          <Check className="h-3.5 w-3.5" />
          {t('adminOnly')}
        </p>
      )}

      {editing === 'new' && <ProductForm farmId={farmId} product={null} options={options} onDone={() => setEditing(null)} />}

      {products.length === 0 && editing !== 'new' ? (
        <p className="text-sm text-ink-4">{t('none')}</p>
      ) : (
        <div className="space-y-3">
          {products.map(p =>
            editing === p.id ? (
              <ProductForm key={p.id} farmId={farmId} product={p} options={options} onDone={() => setEditing(null)} />
            ) : (
              <ProductItem key={p.id} farmId={farmId} product={p} options={options} canEdit={canEdit} onEdit={() => setEditing(p.id)} />
            ),
          )}
        </div>
      )}
    </div>
  )
}
