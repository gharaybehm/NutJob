'use server'

/* eslint-disable @typescript-eslint/no-explicit-any -- crop_packs and the block pack columns postdate the generated Supabase types */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { requireFarmRole } from '@/utils/supabase/farm-access'
import { packDiff, type PackDiff } from '@/engines/pack/diff'
import { packSchema } from '@/engines/pack/schema'
import { findCrop } from '@/utils/crops'

/**
 * Linking a block to an installed crop pack, its version and a variety of
 * that pack. Packs are installed by the platform operator; which pack a
 * block uses, and when it moves to a new version, is the farm admin's
 * decision. Every change is written to block_pack_history (spec R1.4).
 */

export interface InstalledPack {
  packId: string
  version: string
  cropName: string
  varieties: { id: string; name: string }[]
}

/** Every installed pack version, for the block setup screen. Packs hold published science and no farm data. */
export async function listInstalledPacks(farmId: string): Promise<InstalledPack[]> {
  const gate = await requireFarmRole(farmId, 'supervisor')
  if (!gate.ok) return []
  const supabase = (await createClient()) as any
  const { data } = await supabase.from('crop_packs').select('pack_id, version, crop_name, content').order('pack_id').order('installed_at', { ascending: false })
  return (data ?? []).map((p: any) => ({
    packId: p.pack_id,
    version: p.version,
    cropName: p.crop_name,
    varieties: Array.isArray(p.content?.varieties?.varieties) ? p.content.varieties.varieties.map((v: any) => ({ id: String(v.id), name: String(v.name) })) : [],
  }))
}

/** What changed between two installed versions of a pack; null when either cannot be read. */
export async function getPackDiff(farmId: string, packId: string, fromVersion: string, toVersion: string): Promise<PackDiff | null> {
  const gate = await requireFarmRole(farmId, 'supervisor')
  if (!gate.ok) return null
  const supabase = (await createClient()) as any
  const read = async (version: string) => {
    const { data } = await supabase.from('crop_packs').select('content').eq('pack_id', packId).eq('version', version).maybeSingle()
    const parsed = data ? packSchema.safeParse(data.content) : null
    return parsed?.success ? parsed.data : null
  }
  const [from, to] = await Promise.all([read(fromVersion), read(toVersion)])
  return from && to ? packDiff(from, to) : null
}

export type BlockPackResult = { ok: true } | { ok: false; error: 'forbidden' | 'notFound' | 'pack' | 'crop' | 'variety' | 'failed' }

/** Links a block to a pack version and variety, or removes the link when `packId` is null. */
export async function setBlockPack(blockId: string, input: { packId: string | null; version: string | null; varietyId: string | null }): Promise<BlockPackResult> {
  const supabase = (await createClient()) as any
  const { data: block } = await supabase.from('blocks').select('farm_id, crop_type').eq('id', blockId).maybeSingle()
  if (!block?.farm_id) return { ok: false, error: 'notFound' }
  const gate = await requireFarmRole(block.farm_id, 'admin')
  if (!gate.ok) return { ok: false, error: 'forbidden' }

  let link: { pack_id: string | null; pack_version: string | null; pack_variety_id: string | null } = { pack_id: null, pack_version: null, pack_variety_id: null }
  if (input.packId !== null) {
    if (!input.version) return { ok: false, error: 'pack' }
    const { data: packRow } = await supabase.from('crop_packs').select('content').eq('pack_id', input.packId).eq('version', input.version).maybeSingle()
    const parsed = packRow ? packSchema.safeParse(packRow.content) : null
    if (!parsed?.success) return { ok: false, error: 'pack' }
    const pack = parsed.data
    // A block takes only the pack of its own crop: another crop's numbers must never be applied to it.
    const packCrop = findCrop(pack.manifest.crop.common_name)?.id ?? pack.manifest.crop.common_name.trim().toLowerCase()
    const blockCrop = findCrop(block.crop_type)?.id ?? String(block.crop_type ?? '').trim().toLowerCase()
    if (packCrop !== blockCrop) return { ok: false, error: 'crop' }
    if (input.varietyId !== null && !(pack.varieties?.varieties ?? []).some(v => v.id === input.varietyId)) return { ok: false, error: 'variety' }
    link = { pack_id: pack.manifest.id, pack_version: pack.manifest.version, pack_variety_id: input.varietyId }
  }

  const { error } = await supabase.from('blocks').update({ ...link, updated_at: new Date().toISOString() }).eq('id', blockId).eq('farm_id', block.farm_id)
  if (error) return { ok: false, error: 'failed' }

  // The change itself has been made; a failure to write its history entry is reported, not hidden.
  const { error: historyError } = await supabase.from('block_pack_history').insert({ farm_id: block.farm_id, block_id: blockId, ...link, changed_by: gate.actor.userId, reason: 'Changed in farm settings' })
  if (historyError) return { ok: false, error: 'failed' }

  revalidatePath(`/${block.farm_id}/settings`)
  return { ok: true }
}
