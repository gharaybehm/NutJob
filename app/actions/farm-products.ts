'use server'

/* eslint-disable @typescript-eslint/no-explicit-any -- farm_products postdates the generated Supabase types */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { requireFarmRole } from '@/utils/supabase/farm-access'
import { validateProduct, type ProductError } from '@/utils/decision/products'

/**
 * The farm's product library. Label values decide what may be sprayed, so
 * only a farm admin writes and approves them (the approval the specification
 * gives the agronomist). Any change to a product clears its approval: the
 * values must be checked against the label again. Row-level security
 * enforces the same.
 */

export type ProductResult = { ok: true } | { ok: false; error: ProductError | 'forbidden' | 'duplicate' | 'failed' }

function row(farmId: string, p: Extract<ReturnType<typeof validateProduct>, { ok: true }>['value']) {
  return {
    farm_id: farmId,
    name: p.name,
    product_type: p.productType,
    active_ingredient: p.activeIngredient,
    mode_of_action_group: p.modeOfActionGroup,
    targets: p.targets,
    // An empty list is stored as "not recorded", which is what it is.
    registered_crops: p.registeredCrops.length > 0 ? p.registeredCrops : null,
    registration_number: p.registrationNumber,
    max_wind_ms: p.maxWindMs,
    min_wind_ms: p.minWindMs,
    rainfast_hours: p.rainfastHours,
    phi_days: p.phiDays,
    rei_hours: p.reiHours,
    max_applications_per_season: p.maxApplicationsPerSeason,
    bee_toxic: p.beeToxic,
    nutrient_content: p.nutrientContent,
    notes: p.notes,
    approved_by: null,
    approved_at: null,
    updated_at: new Date().toISOString(),
  }
}

/** Creates a product, or changes one when `productId` is given. Either way it is left unapproved. */
export async function saveFarmProduct(farmId: string, productId: string | null, input: unknown): Promise<ProductResult> {
  const gate = await requireFarmRole(farmId, 'admin')
  if (!gate.ok) return { ok: false, error: 'forbidden' }
  const v = validateProduct(input)
  if (!v.ok) return { ok: false, error: v.error }

  const supabase = await createClient()
  const table = (supabase as any).from('farm_products')
  const { error } = productId
    ? await table.update(row(farmId, v.value)).eq('id', productId).eq('farm_id', farmId)
    : await table.insert(row(farmId, v.value))
  if (error) return { ok: false, error: error.code === '23505' ? 'duplicate' : 'failed' }

  revalidatePath(`/${farmId}/settings`)
  return { ok: true }
}

/** Records that an admin has checked the product's values against its label. */
export async function approveFarmProduct(farmId: string, productId: string): Promise<ProductResult> {
  const gate = await requireFarmRole(farmId, 'admin')
  if (!gate.ok) return { ok: false, error: 'forbidden' }
  const supabase = await createClient()
  const { error } = await (supabase as any)
    .from('farm_products')
    .update({ approved_by: gate.actor.userId, approved_at: new Date().toISOString() })
    .eq('id', productId)
    .eq('farm_id', farmId)
  if (error) return { ok: false, error: 'failed' }
  revalidatePath(`/${farmId}/settings`)
  return { ok: true }
}

export async function deleteFarmProduct(farmId: string, productId: string): Promise<ProductResult> {
  const gate = await requireFarmRole(farmId, 'admin')
  if (!gate.ok) return { ok: false, error: 'forbidden' }
  const supabase = await createClient()
  const { error } = await (supabase as any).from('farm_products').delete().eq('id', productId).eq('farm_id', farmId)
  if (error) return { ok: false, error: 'failed' }
  revalidatePath(`/${farmId}/settings`)
  return { ok: true }
}
