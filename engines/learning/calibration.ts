/**
 * The learning loop's record (CDSS spec §A11.3): calibrated parameter values
 * as farm-level overrides on top of a pack, per farm, variety or block. The
 * pack is never changed by learning.
 *
 * Every step is an event, and the record is append-only:
 *   proposed     a calibration job offers a challenger value, with its backtest
 *   promoted     the farm admin puts it in force (R11.2)
 *   rejected     the farm admin turns it down
 *   rolled_back  the farm admin undoes a promotion in one step (R11.5); the
 *                value promoted before it, or the pack's value, is in force again
 *
 * A value outside the pack's bounds is held, never promoted (R11.1). A
 * parameter whose bounds are a single value is fixed by the pack and is not
 * calibrated. Manager decisions are not events here (R11.4): outcomes, not
 * overrides, produce challengers.
 */

export type CalibrationEventKind = 'proposed' | 'promoted' | 'rejected' | 'rolled_back'

export interface Backtest {
  /** The metric the pack declares for the engine (metrics.yaml). */
  metric: string
  /** Error on the logged history with the value in force, and with the challenger; lower is better. */
  champion: number
  challenger: number
  /** Logged outcomes the backtest used. */
  n: number
}

export interface CalibrationEvent {
  id: string
  kind: CalibrationEventKind
  packId: string
  paramId: string
  blockId: string | null
  varietyId: string | null
  /** The challenger value; on 'proposed' only. */
  value: number | null
  /** For promoted, rejected and rolled_back: the 'proposed' event it decides. */
  calibrationId: string | null
  /** How the value was worked out; on 'proposed' only. */
  method: string | null
  backtest: Backtest | null
  at: string
}

export interface Calibration {
  id: string
  value: number
  method: string | null
  backtest: Backtest | null
  proposedAt: string
  status: 'challenger' | 'in_force' | 'superseded' | 'rejected' | 'rolled_back'
  decidedAt: string | null
}

export interface ScopeState {
  scope: string
  packId: string
  paramId: string
  blockId: string | null
  varietyId: string | null
  /** The promoted calibration in force; null means the pack's value. */
  inForce: Calibration | null
  /** Every calibration of the scope, newest first. */
  history: Calibration[]
}

export function scopeKey(e: Pick<CalibrationEvent, 'packId' | 'paramId' | 'blockId' | 'varietyId'>): string {
  return [e.packId, e.paramId, e.blockId ?? '*', e.varietyId ?? '*'].join('|')
}

/** The state of every scope, from the events in any order. */
export function calibrationStates(events: CalibrationEvent[]): Map<string, ScopeState> {
  const ordered = [...events].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
  const proposed = new Map<string, CalibrationEvent>()
  for (const e of ordered) if (e.kind === 'proposed' && e.value !== null) proposed.set(e.id, e)

  const states = new Map<string, ScopeState>()
  const calibrations = new Map<string, Calibration>()
  /** Promoted calibration ids per scope, the one in force last. */
  const stacks = new Map<string, string[]>()

  for (const e of ordered) {
    const source = e.kind === 'proposed' ? e : e.calibrationId ? proposed.get(e.calibrationId) : undefined
    if (!source || source.value === null) continue
    const scope = scopeKey(source)
    if (!states.has(scope)) states.set(scope, { scope, packId: source.packId, paramId: source.paramId, blockId: source.blockId, varietyId: source.varietyId, inForce: null, history: [] })
    const stack = stacks.get(scope) ?? []
    stacks.set(scope, stack)

    if (e.kind === 'proposed') {
      calibrations.set(e.id, { id: e.id, value: source.value, method: e.method, backtest: e.backtest, proposedAt: e.at, status: 'challenger', decidedAt: null })
      continue
    }
    const c = calibrations.get(source.id)
    if (!c) continue
    if (e.kind === 'promoted' && c.status === 'challenger') {
      const previous = stack.at(-1)
      if (previous) calibrations.get(previous)!.status = 'superseded'
      stack.push(c.id)
      c.status = 'in_force'
      c.decidedAt = e.at
    } else if (e.kind === 'rejected' && c.status === 'challenger') {
      c.status = 'rejected'
      c.decidedAt = e.at
    } else if (e.kind === 'rolled_back' && (c.status === 'in_force' || c.status === 'superseded')) {
      const at = stack.indexOf(c.id)
      if (at >= 0) stack.splice(at, 1)
      c.status = 'rolled_back'
      c.decidedAt = e.at
      const back = stack.at(-1)
      if (back) calibrations.get(back)!.status = 'in_force'
    }
  }

  for (const [id, c] of calibrations) {
    const scope = scopeKey(proposed.get(id)!)
    states.get(scope)!.history.push(c)
  }
  for (const [scope, state] of states) {
    state.history.sort((a, b) => b.proposedAt.localeCompare(a.proposedAt))
    const top = stacks.get(scope)?.at(-1)
    state.inForce = top ? calibrations.get(top) ?? null : null
  }
  return states
}

/**
 * The overrides for one block's pack context: a block's own calibration
 * first, then its variety's, then the farm's.
 */
export function overridesFor(states: Map<string, ScopeState>, packId: string, blockId: string, varietyId: string | null): Record<string, number> {
  const rank = (s: ScopeState) => (s.blockId === blockId ? 3 : s.blockId === null && s.varietyId !== null && s.varietyId === varietyId ? 2 : s.blockId === null && s.varietyId === null ? 1 : 0)
  const best = new Map<string, { rank: number; value: number }>()
  for (const s of states.values()) {
    if (s.packId !== packId || !s.inForce) continue
    const r = rank(s)
    if (r === 0) continue
    const seen = best.get(s.paramId)
    if (!seen || r > seen.rank) best.set(s.paramId, { rank: r, value: s.inForce.value })
  }
  return Object.fromEntries([...best].map(([id, { value }]) => [id, value]))
}

export type PromotionRefusal = 'notChallenger' | 'unknownParameter' | 'fixed' | 'bounds' | 'noBacktest' | 'notBetter'

/**
 * Whether a challenger may be promoted: inside the pack's bounds for a
 * parameter the pack lets vary, and better than the value in force on the
 * logged history. The farm admin's approval is the caller's check.
 */
export function canPromote(
  calibration: Pick<Calibration, 'status' | 'value' | 'backtest'>,
  parameter: { bounds?: [number, number] | null } | undefined,
): { ok: true } | { ok: false; reason: PromotionRefusal } {
  if (calibration.status !== 'challenger') return { ok: false, reason: 'notChallenger' }
  if (!parameter) return { ok: false, reason: 'unknownParameter' }
  const bounds = parameter.bounds ?? null
  if (!bounds || bounds[0] === bounds[1]) return { ok: false, reason: 'fixed' }
  if (calibration.value < bounds[0] || calibration.value > bounds[1]) return { ok: false, reason: 'bounds' }
  const b = calibration.backtest
  if (!b || !(b.n > 0) || !Number.isFinite(b.champion) || !Number.isFinite(b.challenger)) return { ok: false, reason: 'noBacktest' }
  if (!(b.challenger < b.champion)) return { ok: false, reason: 'notBetter' }
  return { ok: true }
}
