'use server'

/* eslint-disable @typescript-eslint/no-explicit-any -- farm_products and crop_packs postdate the generated Supabase types */
import { createClient } from '@/utils/supabase/server'
import { requireFarmRole } from '@/utils/supabase/farm-access'
import { packSchema, type Pack } from '@/engines/pack/schema'
import { productOptions } from '@/utils/decision/pack-options'

/**
 * The farm's product library as the spray forms offer it: each spray product
 * with what it is used against, named from the crop packs the farm's blocks
 * are bound to. A spray logged with a library product counts towards that
 * product's maximum applications and its pre-harvest and re-entry intervals
 * in the decision engine's safeguards. Any member logs sprays, so any member
 * may read the list; row-level security on farm_products says the same.
 */

export interface SprayLibraryProduct {
  id: string
  name: string
  approved: boolean
  targets: { id: string; name: string }[]
}

export async function getSprayLibrary(farmId: string): Promise<SprayLibraryProduct[]> {
  const gate = await requireFarmRole(farmId, 'worker')
  if (!gate.ok) return []
  const db = (await createClient()) as any

  const [{ data: products }, { data: blocks }] = await Promise.all([
    db.from('farm_products').select('id, name, product_type, targets, approved_at').eq('farm_id', farmId).order('name'),
    db.from('blocks').select('pack_id, pack_version').eq('farm_id', farmId),
  ])
  const packs: Pack[] = []
  const keys = new Set<string>((blocks ?? []).filter((b: any) => b.pack_id && b.pack_version).map((b: any) => `${b.pack_id}@${b.pack_version}`))
  for (const key of keys) {
    const [packId, version] = key.split('@')
    const { data } = await db.from('crop_packs').select('content').eq('pack_id', packId).eq('version', version).maybeSingle()
    const parsed = data ? packSchema.safeParse(data.content) : null
    if (parsed?.success) packs.push(parsed.data)
  }
  const names = new Map(productOptions(packs).targets.map(t => [t.id, t.name]))

  return (products ?? [])
    .filter((p: any) => p.product_type !== 'fertiliser')
    .map((p: any) => ({
      id: p.id,
      name: p.name,
      approved: Boolean(p.approved_at),
      targets: (Array.isArray(p.targets) ? (p.targets as string[]) : []).map(id => ({ id, name: names.get(id) ?? id })),
    }))
}
