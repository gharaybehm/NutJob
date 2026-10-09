/**
 * Irrigation and hydraulic safeguards (CDSS spec §A10.2, SG-IRR-1 to 3).
 * Commands issued here override every other layer. They run on every sensor
 * cycle and before any actuator command.
 *
 *   SG-IRR-1  hydraulic protection, always evaluated first: close a valve
 *             that has run past its maximum time or shows a burst; raise an
 *             alert for an open valve with no flow
 *   SG-IRR-2  too few trustworthy probes: never irrigate automatically from
 *             sensor data; schedule from the water balance and check by hand
 *   SG-IRR-3  emergency floor: a time-capped irrigation only when enough
 *             valid probes agree the block is below its floor
 *
 * Not connected to anything yet: the application has no irrigation
 * controller integration, so no valve can be commanded. The rules are here,
 * with the specification's acceptance tests, for when it has.
 */

export interface ValveState {
  isOpen: boolean
  minutesOpen: number
}

export interface IrrigationLimits {
  maxRunMinutes: number
  expectedFlowLpm: number
  /** Flow above expected x this factor is treated as a burst or leak. */
  burstFactor: number
  minFlowLpm: number
  minValidProbes: number
  minAgreeingProbes: number
  /** Length of an emergency irrigation, minutes. */
  emergencyMinutes: number
}

export interface IrrigationBlock {
  id: string
  /**
   * Water content below which the emergency irrigation runs, %. Set per block
   * from its soil, well above permanent wilting point: a last line of defence,
   * not a schedule.
   */
  emergencyFloorVwc: number
}

export type IrrigationCommand =
  | { type: 'CLOSE_VALVE'; blockId: string }
  | { type: 'OPEN_VALVE_CAPPED'; blockId: string; minutes: number }
  | { type: 'DEGRADED_MODE'; blockId: string }
  | { type: 'ALERT'; message: string }

/** Minutes an open valve may show no flow before an alert. */
const NO_FLOW_GRACE_MINUTES = 5

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** `probes` holds one entry per soil probe in the block: its water content and whether it passed validation. */
export function irrigationSafeguards(
  block: IrrigationBlock,
  probes: { vwcPct: number; valid: boolean }[],
  valve: ValveState,
  flowLpm: number,
  limits: IrrigationLimits,
): IrrigationCommand[] {
  const out: IrrigationCommand[] = []
  const valid = probes.filter(p => p.valid).map(p => p.vwcPct)

  // SG-IRR-1  Hydraulic protection: always evaluated first
  if (valve.isOpen && valve.minutesOpen > limits.maxRunMinutes) {
    out.push({ type: 'CLOSE_VALVE', blockId: block.id }, { type: 'ALERT', message: 'SG-IRR-1 max run time exceeded' })
  }
  if (valve.isOpen && flowLpm > limits.expectedFlowLpm * limits.burstFactor) {
    out.push({ type: 'CLOSE_VALVE', blockId: block.id }, { type: 'ALERT', message: 'SG-IRR-1 possible burst / leak' })
  }
  if (valve.isOpen && valve.minutesOpen > NO_FLOW_GRACE_MINUTES && flowLpm < limits.minFlowLpm) {
    out.push({ type: 'ALERT', message: 'SG-IRR-1 valve open, no flow' })
  }

  // SG-IRR-2  Not enough trustworthy sensors: never auto-irrigate on sensor data
  if (valid.length < limits.minValidProbes) {
    out.push(
      { type: 'DEGRADED_MODE', blockId: block.id },
      { type: 'ALERT', message: 'SG-IRR-2 insufficient valid probes; schedule from water balance; manual check' },
    )
    return out
  }

  // SG-IRR-3  Emergency floor: needs agreement of valid probes, capped duration
  const below = valid.filter(v => v <= block.emergencyFloorVwc)
  if (below.length >= limits.minAgreeingProbes && median(valid) <= block.emergencyFloorVwc) {
    out.push(
      { type: 'OPEN_VALVE_CAPPED', blockId: block.id, minutes: limits.emergencyMinutes },
      { type: 'ALERT', message: 'SG-IRR-3 emergency floor breached; AI plan bypassed for this block' },
    )
  }
  return out
}
