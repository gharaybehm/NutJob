'use server'

/* eslint-disable @typescript-eslint/no-explicit-any -- blocks and farm_policy columns postdate the generated Supabase types */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { requireFarmRole } from '@/utils/supabase/farm-access'
import { validateBlockSetup, validateFarmSetup, type SetupError } from '@/utils/decision/setup'

/**
 * Settings the decision engine reads, saved from the farm's settings page.
 * Supervisors and admins only; row-level security enforces the same.
 *
 * `error` is a key the form translates, or 'forbidden' / 'notFound' / 'failed'.
 */
export type SetupResult = { ok: true } | { ok: false; error: SetupError | 'forbidden' | 'notFound' | 'failed' }

export async function saveBlockDecisionSetup(blockId: string, input: unknown): Promise<SetupResult> {
  const supabase = await createClient()
  const { data: block } = await (supabase.from('blocks') as any).select('farm_id').eq('id', blockId).maybeSingle()
  if (!block?.farm_id) return { ok: false, error: 'notFound' }

  const gate = await requireFarmRole(block.farm_id, 'supervisor')
  if (!gate.ok) return { ok: false, error: 'forbidden' }

  const v = validateBlockSetup(input, new Date().toISOString().slice(0, 10))
  if (!v.ok) return { ok: false, error: v.error }

  const { error } = await (supabase.from('blocks') as any)
    .update({
      canopy_cover_fraction: v.value.canopyCoverFraction,
      canopy_height_m: v.value.canopyHeightM,
      canopy_measured_on: v.value.canopyMeasuredOn,
      wetted_fraction: v.value.wettedFraction,
      expected_yield_kg_ha: v.value.expectedYieldKgHa,
      expected_yield_season: v.value.expectedYieldSeason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', blockId)
    .eq('farm_id', block.farm_id)
  if (error) return { ok: false, error: 'failed' }

  revalidatePath(`/${block.farm_id}/settings`)
  return { ok: true }
}

export async function saveFarmDecisionSetup(farmId: string, input: unknown): Promise<SetupResult> {
  const gate = await requireFarmRole(farmId, 'supervisor')
  if (!gate.ok) return { ok: false, error: 'forbidden' }

  const v = validateFarmSetup(input)
  if (!v.ok) return { ok: false, error: v.error }

  const supabase = await createClient()
  // Only these columns are written; a farm with no policy row yet gets one with the defaults for the rest.
  const { error } = await (supabase as any).from('farm_policy').upsert(
    {
      farm_id: farmId,
      price_per_yield_unit: v.value.pricePerYieldUnit,
      price_currency: v.value.priceCurrency,
      daily_labour_hours: v.value.dailyLabourHours,
      daily_water_m3: v.value.dailyWaterM3,
      sprayer_count: v.value.sprayerCount,
      frost_protection_method: v.value.frostProtectionMethod,
      updated_by: gate.actor.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'farm_id' },
  )
  if (error) return { ok: false, error: 'failed' }

  revalidatePath(`/${farmId}/settings`)
  return { ok: true }
}
