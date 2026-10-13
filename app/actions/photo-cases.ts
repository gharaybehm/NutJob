'use server'

/* eslint-disable @typescript-eslint/no-explicit-any -- photo_cases postdates the generated Supabase types */
import { after } from 'next/server'
import { getLocale } from 'next-intl/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getFarmMemberNames, requireFarmRole } from '@/utils/supabase/farm-access'
import { languageName } from '@/utils/assistant/prompt'
import { CONFIRMED_HEALTHY, MAX_CONFIRMED_CHARS, MAX_NOTE_CHARS, PHOTO_BUCKET, isUuid, pathsBelongToCase } from '@/utils/photo/case'
import { LIMIT_WINDOW_MS, PENDING_STALE_MS, limitHit } from '@/utils/photo/limits'
import { runPhotoCauses } from '@/utils/photo/run-causes'

/**
 * Photo cases: 1 to 3 photos of one problem on one tree, saved against a
 * block (Requirements.md, Photo cases). Workers do the scouting, so any member
 * of the farm may add a case; a worker sees only their own, supervisors and
 * admins see every case on the farm. Row-level security enforces the same.
 *
 * Photos are uploaded by the browser straight to storage, then recorded here.
 * Nobody reads the bucket directly: the links below are signed by the server,
 * for an hour, only for cases the caller is allowed to see.
 *
 * Possible causes (the model step) are for supervisors and admins only. They
 * are worded as possibilities to confirm in the field, carry no confidence
 * figure and no product or dose, and are written by the server alone.
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
  // block again. A repeat of a case already recorded changes nothing and
  // returns no row.
  const { data: inserted, error } = await (supabase as any)
    .from('photo_cases')
    .upsert(
      { id: caseId, farm_id: farmId, block_id: blockId, taken_at: takenAt, note: note || null, photo_paths: paths, entered_by: gate.actor.userId },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    .select('id')
  if (error) return { ok: false, error: 'failed' }

  // Only a case recorded just now starts the model step, so a repeated send
  // never asks twice. The case is saved whatever happens here.
  if ((inserted ?? []).length > 0) {
    try {
      await startCauses(admin as any, caseId, farmId, gate.actor.userId)
    } catch (e) {
      console.error('[photo-cases] could not start the model step', e instanceof Error ? e.message : e)
    }
  }
  return { ok: true }
}

/** Decides whether the model is asked about a new case, and schedules it after the response. */
async function startCauses(admin: any, caseId: string, farmId: string, userId: string): Promise<void> {
  const row = (fields: Record<string, unknown>) =>
    admin.from('photo_case_results').upsert({ case_id: caseId, farm_id: farmId, ...fields }, { onConflict: 'case_id', ignoreDuplicates: true })

  const { data: farm } = await admin.from('farms').select('photo_causes_enabled').eq('id', farmId).maybeSingle()
  if (farm?.photo_causes_enabled === false) {
    await row({ status: 'off', reason: 'disabled' })
    return
  }

  const since = new Date(Date.now() - LIMIT_WINDOW_MS).toISOString()
  const recent = () => admin.from('photo_cases').select('id', { count: 'exact', head: true }).gte('created_at', since).neq('id', caseId)
  const [{ count: userCount }, { count: farmCount }] = await Promise.all([recent().eq('entered_by', userId), recent().eq('farm_id', farmId)])
  const hit = limitHit(userCount ?? 0, farmCount ?? 0)
  if (hit) {
    await row({ status: 'off', reason: hit })
    return
  }

  await row({ status: 'pending' })
  const language = languageName(await getLocale())
  // After the response, so saving in the field does not wait for the model.
  after(() => runPhotoCauses(caseId, language))
}

/** Possible causes of one case, as supervisors and admins see them. */
export interface PhotoCaseCauses {
  status: 'pending' | 'done' | 'failed' | 'off'
  /** For 'off': disabled, limit_user, limit_farm or not_run. */
  reason: string | null
  photos: { usable: boolean; problem: string }[]
  healthy: boolean | null
  /** Most likely first. No confidence figure: it does not tell right from wrong. */
  causes: { name: string; signs: string }[]
  /** What a supervisor or admin said it was; CONFIRMED_HEALTHY for nothing wrong. */
  confirmedCause: string | null
}

function readCauses(r: any): PhotoCaseCauses {
  const result = r.result && typeof r.result === 'object' ? r.result : {}
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  // A step that never finished (the server stopped) is shown as failed, so it can be run again.
  const stale = r.status === 'pending' && Date.now() - Date.parse(r.updated_at) > PENDING_STALE_MS
  return {
    status: stale ? 'failed' : r.status,
    reason: r.reason ?? null,
    photos: Array.isArray(result.photos) ? result.photos.map((p: any) => ({ usable: p?.usable === true, problem: str(p?.problem) })) : [],
    healthy: typeof result.healthy === 'boolean' ? result.healthy : null,
    causes: Array.isArray(result.causes)
      ? result.causes.map((c: any) => ({ name: str(c?.name), signs: str(c?.signs) })).filter((c: { name: string }) => c.name)
      : [],
    confirmedCause: r.confirmed_cause ?? null,
  }
}

export interface PhotoCaseRow {
  id: string
  takenAt: string
  note: string | null
  enteredBy: string
  mine: boolean
  /** Signed links, valid for an hour, in the order the photos were taken. */
  photos: string[]
  /** Supervisors and admins only; null for a worker, or when the model was never asked. */
  causes: PhotoCaseCauses | null
}

export interface PhotoCaseListResult {
  status: 'ok' | 'forbidden' | 'unavailable'
  cases: PhotoCaseRow[]
  /** Supervisors and admins: sees every case and its possible causes, and may remove one. */
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

  // Possible causes: read as the user, and row-level security lets only
  // supervisors and admins see them. A worker is not even asked.
  const causes = new Map<string, PhotoCaseCauses>()
  if (canManage && (rows ?? []).length > 0) {
    const { data: results } = await (supabase as any)
      .from('photo_case_results')
      .select('case_id, status, reason, result, confirmed_cause, updated_at')
      .in('case_id', (rows ?? []).map((r: any) => r.id))
    for (const r of results ?? []) causes.set(r.case_id, readCauses(r))
  }

  const names = canManage ? await getFarmMemberNames(block.farm_id) : new Map<string, string>()
  const cases: PhotoCaseRow[] = (rows ?? []).map((r: any) => ({
    id: r.id,
    takenAt: r.taken_at,
    note: r.note ?? null,
    enteredBy: names.get(r.entered_by) ?? '',
    mine: r.entered_by === gate.actor.userId,
    photos: (r.photo_paths as string[]).map((p) => links.get(p)).filter((u): u is string => Boolean(u)),
    causes: causes.get(r.id) ?? null,
  }))
  return { status: 'ok', cases, canManage }
}

/** The farm of a case, once the caller is known to be a supervisor or admin of it. */
async function managedCase(blockId: string, caseId: string): Promise<{ farmId: string; userId: string; admin: any } | null> {
  if (typeof blockId !== 'string' || !blockId || !isUuid(caseId)) return null
  const supabase = await createClient()
  const { data: block } = await (supabase as any).from('blocks').select('farm_id').eq('id', blockId).maybeSingle()
  if (!block?.farm_id) return null
  const gate = await requireFarmRole(block.farm_id, 'supervisor')
  if (!gate.ok) return null
  // The service role is needed below (photos, results). Every statement is
  // scoped to the case, its block and the farm just checked, so an id from
  // another farm matches nothing.
  const admin = createAdminClient() as any
  const { data: row } = await admin.from('photo_cases').select('id').eq('id', caseId).eq('block_id', blockId).eq('farm_id', block.farm_id).maybeSingle()
  return row ? { farmId: block.farm_id, userId: gate.actor.userId, admin } : null
}

export async function deletePhotoCase(blockId: string, caseId: string): Promise<{ ok: boolean }> {
  const found = await managedCase(blockId, caseId)
  if (!found) return { ok: false }
  const { admin, farmId } = found

  const { data: row } = await admin.from('photo_cases').select('photo_paths').eq('id', caseId).eq('farm_id', farmId).maybeSingle()
  if (!row) return { ok: false }
  const paths = (row.photo_paths as string[]).filter((p) => p.startsWith(`${farmId}/${caseId}/`))
  if (paths.length > 0) {
    const { error: removeError } = await admin.storage.from(PHOTO_BUCKET).remove(paths)
    if (removeError) return { ok: false }
  }
  // The result row goes with it (ON DELETE CASCADE).
  const { error } = await admin.from('photo_cases').delete().eq('id', caseId).eq('block_id', blockId).eq('farm_id', farmId)
  return { ok: !error }
}

/**
 * Records what the problem turned out to be: one of the listed causes, the
 * user's own words, CONFIRMED_HEALTHY for nothing wrong, or '' to clear it.
 */
export async function confirmPhotoCase(blockId: string, caseId: string, cause: string): Promise<{ ok: boolean }> {
  if (typeof cause !== 'string') return { ok: false }
  const found = await managedCase(blockId, caseId)
  if (!found) return { ok: false }
  const value =
    cause === CONFIRMED_HEALTHY
      ? CONFIRMED_HEALTHY
      : cause
          .replace(/[\u0000-\u001F\u007F]/g, ' ')
          .trim()
          .slice(0, MAX_CONFIRMED_CHARS)
  const fields = value
    ? { confirmed_cause: value, confirmed_by: found.userId, confirmed_at: new Date().toISOString() }
    : { confirmed_cause: null, confirmed_by: null, confirmed_at: null }

  const { data: updated, error } = await found.admin.from('photo_case_results').update(fields).eq('case_id', caseId).eq('farm_id', found.farmId).select('case_id')
  if (error) return { ok: false }
  if ((updated ?? []).length > 0) return { ok: true }
  // A case the model was never asked about still takes a confirmed cause.
  const { error: insertError } = await found.admin
    .from('photo_case_results')
    .insert({ case_id: caseId, farm_id: found.farmId, status: 'off', reason: 'not_run', ...fields })
  return { ok: !insertError }
}

export type PhotoCaseRerunError = 'forbidden' | 'disabled' | 'busy' | 'failed'

/** Asks the model again about a case that failed or was skipped. Waits for the answer. */
export async function rerunPhotoCase(blockId: string, caseId: string): Promise<{ ok: true } | { ok: false; error: PhotoCaseRerunError }> {
  const found = await managedCase(blockId, caseId)
  if (!found) return { ok: false, error: 'forbidden' }
  const { admin, farmId } = found

  const { data: farm } = await admin.from('farms').select('photo_causes_enabled').eq('id', farmId).maybeSingle()
  if (farm?.photo_causes_enabled === false) return { ok: false, error: 'disabled' }

  const { data: current } = await admin.from('photo_case_results').select('status, updated_at').eq('case_id', caseId).maybeSingle()
  const fresh = current?.status === 'pending' && Date.now() - Date.parse(current.updated_at) <= PENDING_STALE_MS
  // An answer already there is kept, and a step in progress is not doubled.
  if (current?.status === 'done' || fresh) return { ok: false, error: 'busy' }

  const { error } = await admin
    .from('photo_case_results')
    .upsert({ case_id: caseId, farm_id: farmId, status: 'pending', reason: null, updated_at: new Date().toISOString() }, { onConflict: 'case_id' })
  if (error) return { ok: false, error: 'failed' }
  const outcome = await runPhotoCauses(caseId, languageName(await getLocale()))
  return outcome === 'done' ? { ok: true } : { ok: false, error: 'failed' }
}
