/**
 * Frost safeguards (CDSS spec §A10.5, SG-FRO-1 and SG-FRO-2).
 *
 *   SG-FRO-1  frost-protection water has priority over all other night-time
 *             water use in the frost window
 *   SG-FRO-2  wind machines and heaters only run within equipment safety
 *             limits; alert on start failure
 *
 * SG-FRO-1 is applied by the arbitrator: on a night a farm protects with
 * water, other water use on the farm is vetoed. SG-FRO-2 needs the
 * equipment's own readings, which the application does not receive yet.
 */

export type FrostProtectionMethod = 'water' | 'wind_machine' | 'heater'

/**
 * Days (from today) on which frost protection is planned on the farm and so
 * holds the water. Only a farm that protects with water gives it priority.
 */
export function frostWaterPriorityDays(
  frostProtectionDays: number[],
  method: FrostProtectionMethod | null,
): { days: number[]; note: string | null } {
  if (frostProtectionDays.length === 0) return { days: [], note: null }
  if (method === null) {
    return { days: [], note: 'The frost protection method of the farm is not set, so SG-FRO-1 (water priority) could not be applied' }
  }
  return { days: method === 'water' ? [...new Set(frostProtectionDays)].sort((a, b) => a - b) : [], note: null }
}

export interface FrostEquipmentLimits {
  /** Wind above which a wind machine must not run, m/s. */
  maxWindMs: number | null
  /** Seconds allowed between a start command and the equipment reporting that it runs. */
  startTimeoutS: number
}

export interface FrostEquipmentReading {
  commandedOn: boolean
  running: boolean
  secondsSinceCommand: number
  windMs: number | null
}

export type FrostEquipmentCommand = { type: 'STOP'; reason: string } | { type: 'ALERT'; message: string }

export function frostEquipmentSafeguards(r: FrostEquipmentReading, limits: FrostEquipmentLimits): FrostEquipmentCommand[] {
  const out: FrostEquipmentCommand[] = []
  if (limits.maxWindMs !== null && (r.commandedOn || r.running)) {
    if (r.windMs === null) out.push({ type: 'ALERT', message: 'SG-FRO-2 no wind reading while frost equipment runs' })
    else if (r.windMs > limits.maxWindMs) out.push({ type: 'STOP', reason: 'SG-FRO-2 wind above the equipment safety limit' })
  }
  if (r.commandedOn && !r.running && r.secondsSinceCommand > limits.startTimeoutS) {
    out.push({ type: 'ALERT', message: 'SG-FRO-2 frost equipment did not start' })
  }
  return out
}
