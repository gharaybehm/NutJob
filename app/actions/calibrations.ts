'use server'

/* eslint-disable @typescript-eslint/no-explicit-any -- the decision-engine tables postdate the generated Supabase types */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { requireFarmRole } from '@/utils/supabase/farm-access'
import { canPromote, type Calibration, type PromotionRefusal } from '@/engines/learning/calibration'
import { packSchema, type PackParameter } from '@/engines/pack/schema'
import { loadCalibrationStates } from '@/utils/decision/calibrations'

/**
 * The learning loop's calibrated values for a farm, as the Engine plan shows
 * them, and the farm admin's decisions on them: promote a challenger, reject
 * it, or roll a promotion back. Supervisors see the record; only a farm admin
 * decides (decided 2026-10-09: the farm admin holds the agronomist's rights).
 */

export interface CalibrationRow extends Calibration {
  /** Why a challenger cannot be promoted; null when it can, or when it is not a challenger. */
  refusal: PromotionRefusal | null
}

export interface CalibrationScopeView {
  scope: string
  packId: string
  paramId: string
  blockId: string | null
  varietyId: string | null
  unit: string | null
  bounds: [number, number] | null
  /** The pack's own value, in force when no calibration is. */
  packValue: number | null
  inForce: Calibration | null
  history: CalibrationRow[]
}

export interface CalibrationsView {
  status: 'ok' | 'unavailable' | 'forbidden'
  scopes: CalibrationScopeView[]
  canDecide: boolean
}

async function packParameters(db: any, farmId: string): Promise<Map<string, PackParameter>> {
  const { data: blocks } = await db.from('blocks').select('pack_id, pack_version').eq('farm_id', farmId)
  const keys = new Set<string>((blocks ?? []).filter((b: any) => b.pack_id && b.pack_version).map((b: any) => `${b.pack_id}@${b.pack_version}`))
  const params = new Map<string, PackParameter>()
  for (const key of keys) {
    const [packId, version] = key.split('@')
    const { data } = await db.from('crop_packs').select('content').eq('pack_id', packId).eq('version', version).maybeSingle()
    const parsed = data ? packSchema.safeParse(data.content) : null
    if (!parsed?.success) continue
    // With blocks on two versions of a pack, the newer version's definition is shown.
    for (const p of parsed.data.parameters.parameters) params.set(`${packId}|${p.id}`, p)
  }
  return params
}

export async function getCalibrations(farmId: string): Promise<CalibrationsView> {
  const gate = await requireFarmRole(farmId, 'supervisor')
  if (!gate.ok) return { status: 'forbidden', scopes: [], canDecide: false }
  const db = (await createClient()) as any
  const { states, error } = await loadCalibrationStates(db, farmId)
  if (error) return { status: 'unavailable', scopes: [], canDecide: false }
  const params = await packParameters(db, farmId)

  const scopes = [...states.values()].map(s => {
    const p = params.get(`${s.packId}|${s.paramId}`)
    return {
      scope: s.scope,
      packId: s.packId,
      paramId: s.paramId,
      blockId: s.blockId,
      varietyId: s.varietyId,
      unit: p?.unit ?? null,
      bounds: (p?.bounds as [number, number] | undefined) ?? null,
      packValue: p?.start ?? null,
      inForce: s.inForce,
      history: s.history.map(c => {
        const check = canPromote(c, p)
        return { ...c, refusal: c.status === 'challenger' && !check.ok ? check.reason : null }
      }),
    }
  })
  return { status: 'ok', scopes, canDecide: gate.actor.role === 'admin' }
}

export type CalibrationDecision = 'promoted' | 'rejected' | 'rolled_back'
export type CalibrationDecisionResult = { ok: true } | { ok: false; error: 'forbidden' | 'notFound' | 'notAllowed' | PromotionRefusal | 'failed' }

/** Records the farm admin's decision on a calibration. A promotion is refused unless canPromote allows it. */
export async function decideCalibration(farmId: string, calibrationId: string, decision: CalibrationDecision): Promise<CalibrationDecisionResult> {
  const gate = await requireFarmRole(farmId, 'admin')
  if (!gate.ok) return { ok: false, error: 'forbidden' }
  if (!['promoted', 'rejected', 'rolled_back'].includes(decision)) return { ok: false, error: 'notAllowed' }
  const db = (await createClient()) as any

  const { states } = await loadCalibrationStates(db, farmId)
  const scope = [...states.values()].find(s => s.history.some(c => c.id === calibrationId))
  const calibration = scope?.history.find(c => c.id === calibrationId)
  if (!scope || !calibration) return { ok: false, error: 'notFound' }

  if (decision === 'promoted') {
    const params = await packParameters(db, farmId)
    const check = canPromote(calibration, params.get(`${scope.packId}|${scope.paramId}`))
    if (!check.ok) return { ok: false, error: check.reason }
  } else if (decision === 'rejected' && calibration.status !== 'challenger') {
    return { ok: false, error: 'notAllowed' }
  } else if (decision === 'rolled_back' && scope.inForce?.id !== calibrationId) {
    // Only the value in force is rolled back, one step at a time.
    return { ok: false, error: 'notAllowed' }
  }

  const { error } = await db.from('farm_calibration_events').insert({
    farm_id: farmId,
    pack_id: scope.packId,
    param_id: scope.paramId,
    block_id: scope.blockId,
    variety_id: scope.varietyId,
    kind: decision,
    calibration_id: calibrationId,
    actor: gate.actor.userId,
  })
  if (error) return { ok: false, error: 'failed' }
  revalidatePath(`/${farmId}/recommendations`)
  return { ok: true }
}
