'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getSprayLibrary, type SprayLibraryProduct } from '@/app/actions/spray-library'

export interface SprayChoice {
  productId: string
  targetId: string
}

/**
 * Picks the library product a spray used and what it was used against. A
 * spray logged with a library product counts towards its maximum
 * applications and its pre-harvest and re-entry intervals in the decision
 * engine. Shows nothing when the farm's library has no spray products.
 */
export default function SprayProductPicker({
  farmId,
  value,
  onChange,
  selectClassName,
  labelClassName,
}: {
  farmId: string
  value: SprayChoice
  /** `productName` is the chosen product's name, or null when none is chosen. */
  onChange: (v: SprayChoice, productName: string | null) => void
  selectClassName: string
  labelClassName: string
}) {
  const t = useTranslations('activity.sprayLibrary')
  const [products, setProducts] = useState<SprayLibraryProduct[] | null>(null)

  useEffect(() => {
    let live = true
    getSprayLibrary(farmId)
      .then(p => live && setProducts(p))
      .catch(() => live && setProducts([]))
    return () => {
      live = false
    }
  }, [farmId])

  if (!products || products.length === 0) return null
  const product = products.find(p => p.id === value.productId) ?? null

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className={labelClassName}>{t('product')}</label>
        <select
          value={value.productId}
          onChange={e => {
            const next = products.find(p => p.id === e.target.value) ?? null
            onChange({ productId: next?.id ?? '', targetId: next?.targets.length === 1 ? next.targets[0].id : '' }, next?.name ?? null)
          }}
          className={selectClassName}
        >
          <option value="">{t('none')}</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>
              {p.approved ? p.name : t('notApproved', { name: p.name })}
            </option>
          ))}
        </select>
      </div>
      {product && product.targets.length > 0 && (
        <div>
          <label className={labelClassName}>{t('target')}</label>
          <select value={value.targetId} onChange={e => onChange({ ...value, targetId: e.target.value }, product.name)} className={selectClassName}>
            <option value="">{t('anyTarget')}</option>
            {product.targets.map(target => (
              <option key={target.id} value={target.id}>
                {target.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
