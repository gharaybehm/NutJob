'use server'

/* eslint-disable @typescript-eslint/no-explicit-any -- photo_cases postdates the generated Supabase types */
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getFarmMemberNames, requireFarmRole } from '@/utils/supabase/farm-access'
import { MAX_NOTE_CHARS, PHOTO_BUCKET, isUuid, pathsBelongToCase } from '@/utils/photo/case'

/**
 * Photo cases: 1 to 3 photos of one problem on one tree, saved against a
 * block (Requirements.md, Photo cases). Workers do the scouting, so any member
 * of the farm may add a case; a worker sees only their own, supervisors and
 * admins see every case on the farm. Row-level security enforces the same.
 *
 * Photos are uploaded by the browser straight to storage, then recorded here.
 * Nobody reads the bucket directly: the links below are signed by the server,
 * for an hour, only for cases the caller is allowed to see.
 */

const SIGNED_URL_SECONDS = 60 * 60
const RECENT_CASES = 20

export type PhotoCaseSubmitError = 'forbidden' | 'invalid' | 'missing_photos' | 'failed'
export type PhotoCaseSubmitResult = { ok: true } | { ok: false; error: PhotoCaseSubmitError }

export interface PhotoCaseInput {
  farmId: string
  blockId: string
  /** UUID made on the device; a repeat of the same case is ignored. */
  caseId: string
  paths: string[]
  takenAt: string
  note: string
}

export async function submitPhotoCase(input: PhotoCaseInput): Promise<PhotoCaseSubmitResult> {
  const { farmId, blockId, caseId, paths } = input ?? ({} as PhotoCaseInput)
  if (!isUuid(farmId) || !isUuid(caseId) || typeof blockId !== 'string' || !blockId) return { ok: false, error: 'invalid' }
  // Only the case's own paths: a path from another case or farm is never linked.
  if (!pathsBelongToCase(farmId, caseId, paths)) return { ok: false, error: 'invalid' }

  const gate = await requireFarmRole(farmId, 'worker')
  if (!gate.ok) return { ok: false, error: 'forbidden' }

  const supabase = await createClient()
  const { data: block } = await (supabase as any).from('blocks').select('farm_id').eq('id', blockId).maybeSingle()
  if (block?.farm_id !== farmId) return { ok: false, error: 'invalid' }

  // The row must not point at photos that never arrived. The bucket has no
  // read policy for users, so this check needs the service role; it looks only
  // inside the folder of the farm and case already checked above.
  const admin = createAdminClient()
  const { data: stored, error: listError } = await admin.storage.from(PHOTO_BUCKET).list(`${farmId}/${caseId}`)
  if (listError) return { ok: false, error: 'failed' }
  const names = new Set((stored ?? []).map((o) => o.name))
  if (!paths.every((_, i) => names.has(`${i + 1}.jpg`))) return { ok: false, error: 'missing_photos' }

  // A device clock can be wrong; a time in the future is taken as now.
  const now = Date.now()
  const taken = Date.parse(input.takenAt)
  const takenAt = new Date(Number.isFinite(taken) && taken <= now ? taken : now).toISOString()
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, MAX_NOTE_CHARS) : ''

  // Inserted as the user, so row-level security checks membership and the
  // block again. A repeat of a case already recorded changes nothing.
  const { error } = await (supabase as any).from('photo_cases').upsert(
    { id: caseId, farm_id: farmId, block_id: blockId, taken_at: takenAt, note: note || null, photo_paths: paths, entered_by: gate.actor.userId },
    { onConflict: 'id', ignoreDuplicates: true },
  )
  return error ? { ok: false, error: 'failed' } : { ok: true }
}

export interface PhotoCaseRow {
  id: string
  takenAt: string
  note: string | null
  enteredBy: string
  mine: boolean
  /** Signed links, valid for an hour, in the order the photos were taken. */
  photos: string[]
}

export interface PhotoCaseListResult {
  status: 'ok' | 'forbidden' | 'unavailable'
  cases: PhotoCaseRow[]
  /** Supervisors and admins: sees every case and may remove one. */
  canManage: boolean
}

export async function listPhotoCases(blockId: string): Promise<PhotoCaseListResult> {
  const none = { cases: [], canManage: false }
  if (typeof blockId !== 'string' || !blockId) return { status: 'forbidden', ...none }
  const supabase = await createClient()
  const { data: block } = await (supabase as any).from('blocks').select('farm_id').eq('id', blockId).maybeSingle()
  if (!block?.farm_id) return { status: 'forbidden', ...none }
  const gate = await requireFarmRole(block.farm_id, 'worker')
  if (!gate.ok) return { status: 'forbidden', ...none }
  const canManage = gate.actor.role !== 'worker'

  // Read as the user: row-level security returns a worker's own cases only.
  let query = (supabase as any)
    .from('photo_cases')
    .select('id, taken_at, note, photo_paths, entered_by')
    .eq('block_id', blockId)
    .eq('farm_id', block.farm_id)
    .order('taken_at', { ascending: false })
    .limit(RECENT_CASES)
  if (!canManage) query = query.eq('entered_by', gate.actor.userId)
  const { data: rows, error } = await query
  if (error) return { status: 'unavailable', ...none, canManage }

  // Signed only for the rows the user could read, and only for paths inside
  // this farm's folder (the table's own check guarantees that too).
  const allPaths: string[] = (rows ?? []).flatMap((r: any) => (r.photo_paths as string[]).filter((p) => p.startsWith(`${block.farm_id}/`)))
  const links = new Map<string, string>()
  if (allPaths.length > 0) {
    const { data: signed } = await createAdminClient().storage.from(PHOTO_BUCKET).createSignedUrls(allPaths, SIGNED_URL_SECONDS)
    for (const s of signed ?? []) if (s.path && s.signedUrl) links.set(s.path, s.signedUrl)
  }

  const names = canManage ? await getFarmMemberNames(block.farm_id) : new Map<string, string>()
  const cases: PhotoCaseRow[] = (rows ?? []).map((r: any) => ({
    id: r.id,
    takenAt: r.taken_at,
    note: r.note ?? null,
    enteredBy: names.get(r.entered_by) ?? '',
    mine: r.entered_by === gate.actor.userId,
    photos: (r.photo_paths as string[]).map((p) => links.get(p)).filter((u): u is string => Boolean(u)),
  }))
  return { status: 'ok', cases, canManage }
}

export async function deletePhotoCase(blockId: string, caseId: string): Promise<{ ok: boolean }> {
  if (typeof blockId !== 'string' || !blockId || !isUuid(caseId)) return { ok: false }
  const supabase = await createClient()
  const { data: block } = await (supabase as any).from('blocks').select('farm_id').eq('id', blockId).maybeSingle()
  if (!block?.farm_id) return { ok: false }
  const gate = await requireFarmRole(block.farm_id, 'supervisor')
  if (!gate.ok) return { ok: false }

  // The service role is needed to remove the photos. Every statement is scoped
  // to the case, its block and the farm just checked, so an id from another
  // farm matches nothing.
  const admin = createAdminClient() as any
  const { data: row } = await admin.from('photo_cases').select('photo_paths').eq('id', caseId).eq('block_id', blockId).eq('farm_id', block.farm_id).maybeSingle()
  if (!row) return { ok: false }
  const paths = (row.photo_paths as string[]).filter((p) => p.startsWith(`${block.farm_id}/${caseId}/`))
  if (paths.length > 0) {
    const { error: removeError } = await admin.storage.from(PHOTO_BUCKET).remove(paths)
    if (removeError) return { ok: false }
  }
  const { error } = await admin.from('photo_cases').delete().eq('id', caseId).eq('block_id', blockId).eq('farm_id', block.farm_id)
  return { ok: !error }
}
