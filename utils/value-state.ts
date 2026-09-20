/**
 * Value states: every number shown in the app or given to the AI carries its
 * unit, source, observation time and one of five states (plan §8, §23).
 */

export type ValueState = 'KNOWN' | 'ESTIMATED' | 'STALE' | 'CONFLICTING' | 'UNKNOWN'

export type ValueSource = 'sensor' | 'manual' | 'computed' | 'forecast' | 'default'

export interface StatefulValue<T = number> {
  value: T | null
  unit: string
  source: ValueSource
  observedAt: string | null
  state: ValueState
}

/** Hours after which a reading of each kind is considered stale. */
export const STALE_AFTER_HOURS: Record<string, number> = {
  soil_moisture: 25,
  soil_ec: 25,
  soil_temp: 25,
  weather: 6,
  forecast: 12,
  eto: 36,
  lab_test: 24 * 365,
  tissue_sample: 24 * 365,
  stem_water_potential: 24 * 10,
}

const DEFAULT_STALE_HOURS = 48

export function staleAfterHours(kind: string): number {
  return STALE_AFTER_HOURS[kind] ?? DEFAULT_STALE_HOURS
}

interface ClassifyInput {
  value: number | null | undefined
  source: ValueSource
  observedAt: string | null | undefined
  kind: string
  now?: Date
  /** Another reading of the same quantity that disagrees beyond tolerance. */
  conflictsWith?: number | null
  /** Relative tolerance (fraction of the value) before two readings conflict. */
  conflictTolerance?: number
  /** True when the value is a default/assumed figure rather than a measurement. */
  assumed?: boolean
}

export function classifyValue(input: ClassifyInput): ValueState {
  const { value, source, observedAt, kind } = input
  if (value === null || value === undefined || Number.isNaN(value)) return 'UNKNOWN'

  if (input.assumed || source === 'default' || source === 'computed' || source === 'forecast') {
    // Derived or assumed numbers are never presented as measured, but can still go stale.
    if (isStale(observedAt, kind, input.now)) return 'STALE'
    return 'ESTIMATED'
  }

  if (isStale(observedAt, kind, input.now)) return 'STALE'

  if (input.conflictsWith !== null && input.conflictsWith !== undefined) {
    const tol = input.conflictTolerance ?? 0.15
    const scale = Math.max(Math.abs(value), Math.abs(input.conflictsWith), 1e-9)
    if (Math.abs(value - input.conflictsWith) / scale > tol) return 'CONFLICTING'
  }
  return 'KNOWN'
}

function isStale(observedAt: string | null | undefined, kind: string, now = new Date()): boolean {
  if (!observedAt) return true
  const t = Date.parse(observedAt)
  if (Number.isNaN(t)) return true
  return (now.getTime() - t) / 3_600_000 > staleAfterHours(kind)
}

export function makeStatefulValue(
  input: ClassifyInput & { unit: string },
): StatefulValue {
  const value =
    input.value === undefined || Number.isNaN(input.value as number) ? null : (input.value as number | null)
  return {
    value,
    unit: input.unit,
    source: input.source,
    observedAt: input.observedAt ?? null,
    state: classifyValue(input),
  }
}

/** Sensors flagged bad must not feed engines. */
export function usableForCalculation(v: StatefulValue): boolean {
  return v.value !== null && (v.state === 'KNOWN' || v.state === 'ESTIMATED')
}
