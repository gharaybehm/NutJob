/* eslint-disable @typescript-eslint/no-explicit-any -- farm_calibration_events postdates the generated Supabase types */
/**
 * Loads a farm's calibration record (engines/learning/calibration.ts). Used by
 * the daily run and the frost check to put the values in force on top of each
 * block's pack, and by the Engine plan to show the history. Not a "use server"
 * file: callers pass their client.
 */
import { calibrationStates, type Backtest, type CalibrationEvent, type ScopeState } from '@/engines/learning/calibration'

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

function toBacktest(v: any): Backtest | null {
  if (!v || typeof v !== 'object') return null
  const champion = num(v.champion)
  const challenger = num(v.challenger)
  const n = num(v.n)
  return typeof v.metric === 'string' && champion !== null && challenger !== null && n !== null ? { metric: v.metric, champion, challenger, n } : null
}

export function toCalibrationEvent(row: any): CalibrationEvent {
  return {
    id: row.id,
    kind: row.kind,
    packId: row.pack_id,
    paramId: row.param_id,
    blockId: row.block_id ?? null,
    varietyId: row.variety_id ?? null,
    value: num(row.value),
    calibrationId: row.calibration_id ?? null,
    method: row.method ?? null,
    backtest: toBacktest(row.backtest),
    at: String(row.created_at),
  }
}

/** Every scope of the farm, with its value in force and history. Empty when the record cannot be read. */
export async function loadCalibrationStates(db: any, farmId: string): Promise<{ states: Map<string, ScopeState>; error: string | null }> {
  const { data, error } = await db
    .from('farm_calibration_events')
    .select('id, kind, pack_id, param_id, block_id, variety_id, value, method, backtest, calibration_id, created_at')
    .eq('farm_id', farmId)
    .order('created_at', { ascending: true })
  if (error) return { states: new Map(), error: error.message }
  return { states: calibrationStates((data ?? []).map(toCalibrationEvent)), error: null }
}
