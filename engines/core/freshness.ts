/**
 * Freshness of a computed value (CDSS spec §A2, R2.3): every computed state
 * value carries the age of the oldest input it depends on.
 */

import type { StatefulValue, ValueState } from '../../utils/value-state'

export interface Freshness {
  /** Observation time of the oldest input; null when any input has none. */
  oldestObservedAt: string | null
  /** Age of the oldest input in hours; null when it cannot be known. */
  ageHours: number | null
  /** The weakest state among the inputs. */
  weakestState: ValueState
}

const WEAKNESS: Record<ValueState, number> = { KNOWN: 0, ESTIMATED: 1, STALE: 2, CONFLICTING: 3, UNKNOWN: 4 }

export function freshnessOf(inputs: StatefulValue<unknown>[], now: Date = new Date()): Freshness {
  let oldest: number | null = null
  let undated = inputs.length === 0
  let weakestState: ValueState = inputs.length === 0 ? 'UNKNOWN' : 'KNOWN'
  for (const input of inputs) {
    if (WEAKNESS[input.state] > WEAKNESS[weakestState]) weakestState = input.state
    const t = input.observedAt ? Date.parse(input.observedAt) : NaN
    if (Number.isNaN(t)) undated = true
    else if (oldest === null || t < oldest) oldest = t
  }
  if (undated || oldest === null) return { oldestObservedAt: null, ageHours: null, weakestState }
  return {
    oldestObservedAt: new Date(oldest).toISOString(),
    ageHours: (now.getTime() - oldest) / 3_600_000,
    weakestState,
  }
}
