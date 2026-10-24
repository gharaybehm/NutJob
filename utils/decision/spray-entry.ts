/* eslint-disable @typescript-eslint/no-explicit-any -- farm_products postdates the generated Supabase types */
// The library product and target of a logged spray, checked before they are
// stored on the activity log entry (details.product_id, details.target_id),
// where the decision engine's spray safeguards read them. Not a "use server"
// file: callers gate the farm role first and pass their client.

export interface SprayEntryInput {
  productId?: unknown
  targetId?: unknown
}

export type SprayEntry = { product_id: string; target_id: string | null; product_name: string } | null

/**
 * Null when no product was chosen. Throws when the product is not in this
 * farm's library, or the target is not one the product is listed against.
 */
export async function checkSprayEntry(db: any, farmId: string, input: SprayEntryInput | null | undefined): Promise<SprayEntry> {
  const productId = typeof input?.productId === 'string' && input.productId !== '' ? input.productId : null
  if (!productId) return null
  const { data: product } = await db.from('farm_products').select('id, name, targets').eq('id', productId).eq('farm_id', farmId).maybeSingle()
  if (!product) throw new Error('That product is not in this farm\'s library.')
  const targetId = typeof input?.targetId === 'string' && input.targetId !== '' ? input.targetId : null
  const targets: string[] = Array.isArray(product.targets) ? product.targets : []
  if (targetId !== null && !targets.includes(targetId)) throw new Error('The product is not listed against that target.')
  return { product_id: product.id, target_id: targetId, product_name: product.name }
}
