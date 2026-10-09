'use server'

/* eslint-disable @typescript-eslint/no-explicit-any -- field_observations and crop_packs postdate the generated Supabase types */
import { createClient } from '@/utils/supabase/server'
import { requireFarmRole } from '@/utils/supabase/farm-access'
import { observationForms, validateObservation, type ObservationError, type ObservationForm, type ObservationInput } from '@/engines/pack/forms'
import { packSchema } from '@/engines/pack/schema'

/**
 * Field observations: trap checks, counts, hull split, hives, an observed
 * biofix. The forms come from the crop pack the block is bound to. Workers do
 * the scouting, so any member of the farm may read and add; only a supervisor
 * or an admin may remove an entry. Row-level security enforces the same.
 */

export interface FieldObservationRow {
  id: string
  kind: string
  subject: string | null
  observedOn: string
  values: Record<string, unknown>
  notes: string | null
}

export interface ObservationFormsResult {
  /** 'notBound' when the block is not linked to a crop pack; 'unavailable' when the pack could not be read. */
  status: 'ok' | 'notBound' | 'unavailable' | 'forbidden'
  forms: ObservationForm[]
  recent: FieldObservationRow[]
  canDelete: boolean
}

const RECENT_ROWS = 30

async function blockForms(supabase: any, blockId: string): Promise<{ farmId: string; forms: ObservationForm[] | 'notBound' | 'unavailable' } | null> {
  const { data: block } = await supabase.from('blocks').select('farm_id, pack_id, pack_version').eq('id', blockId).maybeSingle()
  if (!block?.farm_id) return null
  if (!block.pack_id || !block.pack_version) return { farmId: block.farm_id, forms: 'notBound' }
  const { data: pack } = await supabase.from('crop_packs').select('content').eq('pack_id', block.pack_id).eq('version', block.pack_version).maybeSingle()
  const parsed = pack ? packSchema.safeParse(pack.content) : null
  return { farmId: block.farm_id, forms: parsed?.success ? observationForms(parsed.data) : 'unavailable' }
}

export async function getObservationForms(blockId: string): Promise<ObservationFormsResult> {
  const empty = { forms: [], recent: [], canDelete: false }
  const supabase = await createClient()
  const found = await blockForms(supabase, blockId)
  if (!found) return { status: 'forbidden', ...empty }
  const gate = await requireFarmRole(found.farmId, 'worker')
  if (!gate.ok) return { status: 'forbidden', ...empty }
  if (found.forms === 'notBound' || found.forms === 'unavailable') return { status: found.forms, ...empty }

  const { data: rows } = await (supabase as any)
    .from('field_observations')
    .select('id, kind, subject, observed_on, data, notes')
    .eq('block_id', blockId)
    .order('observed_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(RECENT_ROWS)
  const recent: FieldObservationRow[] = (rows ?? []).map((r: any) => ({
    id: r.id,
    kind: r.kind,
    subject: r.subject ?? null,
    observedOn: String(r.observed_on).slice(0, 10),
    values: r.data && typeof r.data === 'object' ? r.data : {},
    notes: r.notes ?? null,
  }))
  return { status: 'ok', forms: found.forms, recent, canDelete: gate.actor.role !== 'worker' }
}

export type ObservationSaveResult = { ok: true } | { ok: false; error: ObservationError | 'forbidden' | 'notBound' | 'failed'; field?: string }

export async function logFieldObservation(blockId: string, input: ObservationInput): Promise<ObservationSaveResult> {
  const supabase = await createClient()
  const found = await blockForms(supabase, blockId)
  if (!found) return { ok: false, error: 'forbidden' }
  const gate = await requireFarmRole(found.farmId, 'worker')
  if (!gate.ok) return { ok: false, error: 'forbidden' }
  if (found.forms === 'notBound' || found.forms === 'unavailable') return { ok: false, error: 'notBound' }

  const v = validateObservation(found.forms, input, new Date().toISOString().slice(0, 10))
  if (!v.ok) return { ok: false, error: v.error, field: v.field }

  const { error } = await (supabase as any).from('field_observations').insert({
    farm_id: found.farmId,
    block_id: blockId,
    kind: v.value.kind,
    subject: v.value.subject,
    observed_on: v.value.observedOn,
    data: v.value.values,
    notes: v.value.notes,
    entered_by: gate.actor.userId,
  })
  return error ? { ok: false, error: 'failed' } : { ok: true }
}

export async function deleteFieldObservation(blockId: string, observationId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: block } = await (supabase as any).from('blocks').select('farm_id').eq('id', blockId).maybeSingle()
  if (!block?.farm_id) return { ok: false }
  const gate = await requireFarmRole(block.farm_id, 'supervisor')
  if (!gate.ok) return { ok: false }
  // Scoped to the block and its farm, so an id from another farm cannot be removed.
  const { error } = await (supabase as any).from('field_observations').delete().eq('id', observationId).eq('block_id', blockId).eq('farm_id', block.farm_id)
  return { ok: !error }
}
