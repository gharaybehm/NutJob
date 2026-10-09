/**
 * Sensor validation (CDSS spec §A10.1): runs before anything else. Every
 * fast-data reading passes it before it enters the block state (R2.1).
 * Works for any probe type; the limits are per sensor type and come from
 * the equipment, not from this code.
 */

export interface ProbeLimits {
  /** A latest reading older than this is stale, seconds. */
  maxAgeS: number
  minPlausible: number
  maxPlausible: number
  /** Largest plausible change between two consecutive readings. */
  maxStep: number
}

export type ProbeVerdict = 'OK' | 'NO_DATA' | 'STALE' | 'OUT_OF_RANGE' | 'STUCK' | 'JUMP'

export interface ProbeReading {
  at: Date
  value: number
}

/** Readings needed before a flat series counts as a stuck sensor. */
const STUCK_MIN_READINGS = 12

function populationStdDev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length)
}

/** `readings` are the last six hours of one probe, oldest first. */
export function validateProbe(readings: ProbeReading[], now: Date, limits: ProbeLimits): { valid: boolean; reason: ProbeVerdict } {
  if (readings.length === 0) return { valid: false, reason: 'NO_DATA' }
  const latest = readings[readings.length - 1]
  if ((now.getTime() - latest.at.getTime()) / 1000 > limits.maxAgeS) return { valid: false, reason: 'STALE' }
  if (!(limits.minPlausible <= latest.value && latest.value <= limits.maxPlausible)) return { valid: false, reason: 'OUT_OF_RANGE' }
  const values = readings.map(r => r.value)
  if (values.length >= STUCK_MIN_READINGS && populationStdDev(values) === 0) return { valid: false, reason: 'STUCK' }
  if (values.length >= 2 && Math.abs(values[values.length - 1] - values[values.length - 2]) > limits.maxStep) {
    return { valid: false, reason: 'JUMP' }
  }
  return { valid: true, reason: 'OK' }
}
