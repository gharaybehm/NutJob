/**
 * Fertigation safeguards (CDSS spec §A10.4, SG-FERT-1 to 3).
 *
 *   SG-FERT-1  stop injection if the inline EC or pH leaves the allowed band
 *   SG-FERT-2  never inject unless water is flowing; flush the lines after
 *   SG-FERT-3  cap any single dose at the pack's maximum single-dose rate
 *
 * SG-FERT-3 is applied by the fertigation engine. SG-FERT-1 and 2 need an
 * injector's inline readings, which the application does not receive yet;
 * they are here for when it does.
 */

export interface InjectionLimits {
  /** Allowed band of the inline readings while injecting; from the equipment and the crop's tolerance. */
  ecMin: number
  ecMax: number
  phMin: number
  phMax: number
  /** Flow below this means water is not moving, L/min. */
  minFlowLpm: number
  /** Minutes of clean water after an injection. */
  flushMinutes: number
}

export interface InjectionReading {
  injecting: boolean
  inlineEc: number | null
  inlinePh: number | null
  flowLpm: number | null
  /** Minutes of water run since the last injection ended; null when none has ended. */
  minutesSinceInjection: number | null
}

export type InjectionCommand =
  | { type: 'STOP_INJECTION'; safeguardId: 'SG-FERT-1' | 'SG-FERT-2'; reason: string }
  | { type: 'KEEP_FLUSHING'; safeguardId: 'SG-FERT-2'; minutesLeft: number }

/** A missing reading while injecting is treated as out of band: the injection stops. */
export function injectionSafeguards(r: InjectionReading, limits: InjectionLimits): InjectionCommand[] {
  const out: InjectionCommand[] = []
  if (r.injecting) {
    if (r.flowLpm === null || r.flowLpm < limits.minFlowLpm) {
      out.push({ type: 'STOP_INJECTION', safeguardId: 'SG-FERT-2', reason: 'No water flowing' })
    }
    if (r.inlineEc === null || r.inlineEc < limits.ecMin || r.inlineEc > limits.ecMax) {
      out.push({ type: 'STOP_INJECTION', safeguardId: 'SG-FERT-1', reason: 'Inline EC outside the allowed band' })
    }
    if (r.inlinePh === null || r.inlinePh < limits.phMin || r.inlinePh > limits.phMax) {
      out.push({ type: 'STOP_INJECTION', safeguardId: 'SG-FERT-1', reason: 'Inline pH outside the allowed band' })
    }
  } else if (r.minutesSinceInjection !== null && r.minutesSinceInjection < limits.flushMinutes) {
    out.push({ type: 'KEEP_FLUSHING', safeguardId: 'SG-FERT-2', minutesLeft: limits.flushMinutes - r.minutesSinceInjection })
  }
  return out
}

/** SG-FERT-3: a single dose never exceeds the pack's maximum single-dose rate. */
export function capSingleDose(doseKgHa: number, maxSingleDoseKgHa: number): number {
  return Math.max(0, Math.min(doseKgHa, maxSingleDoseKgHa))
}
