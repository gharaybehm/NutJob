/**
 * Frost risk for one night (CDSS spec §A4.7).
 *
 * The critical temperatures for the block's current stage come from the
 * pack, at one or more damage levels. The watch and warning margins are
 * farm settings. Forecast minimums are uncertain, so watch and warning are
 * judged on the cold end of the forecast range and critical on its centre.
 */

export type FrostRiskLevel = 'none' | 'watch' | 'warning' | 'critical'

export interface CriticalTemperature {
  tempC: number
  /** Fraction of the crop lost at this temperature (0-1); null when the pack gives a tolerance limit only. */
  damageFraction: number | null
}

export interface FrostNightInput {
  /** Lowest forecast temperature of the night, °C. */
  forecastMinC: number
  /** Half-width of the forecast range, °C. */
  uncertaintyC: number
  /** Critical temperatures for the current stage, any order. */
  critical: CriticalTemperature[]
  /** Degrees above the critical temperature at which a warning starts. */
  warningMarginC: number
  /** Degrees above the critical temperature at which a watch starts. */
  watchMarginC: number
}

export interface FrostNightRisk {
  level: FrostRiskLevel
  /** Forecast minimum minus the warmest critical temperature; negative when below it. */
  marginC: number
  /** The critical temperature the level was judged against. */
  criticalC: number
  /** Expected fraction of the crop lost; null when it cannot be estimated. */
  damageFraction: number | null
  /** Why `damageFraction` is null, when it is. */
  damageNote: string | null
}

/** Returns null when the pack gives no critical temperature for the stage. */
export function frostRiskForNight(input: FrostNightInput): FrostNightRisk | null {
  if (input.critical.length === 0) return null
  if (input.watchMarginC < input.warningMarginC) throw new Error('watch margin must not be below warning margin')

  const warmestFirst = [...input.critical].sort((a, b) => b.tempC - a.tempC)
  const criticalC = warmestFirst[0].tempC
  const tmin = input.forecastMinC
  const coldEnd = tmin - Math.abs(input.uncertaintyC)

  let level: FrostRiskLevel = 'none'
  if (tmin <= criticalC) level = 'critical'
  else if (coldEnd <= criticalC + input.warningMarginC) level = 'warning'
  else if (coldEnd <= criticalC + input.watchMarginC) level = 'watch'

  const { damageFraction, damageNote } = interpolateDamage(tmin, warmestFirst)
  return { level, marginC: tmin - criticalC, criticalC, damageFraction, damageNote }
}

/** Linear interpolation between the pack's damage levels (spec §A4.7). */
function interpolateDamage(
  tmin: number,
  warmestFirst: CriticalTemperature[],
): { damageFraction: number | null; damageNote: string | null } {
  const levels = warmestFirst.filter(
    (c): c is { tempC: number; damageFraction: number } => c.damageFraction !== null,
  )
  if (levels.length < 2) {
    return { damageFraction: null, damageNote: 'The pack gives fewer than two damage levels for this stage' }
  }
  if (tmin > levels[0].tempC) {
    return { damageFraction: null, damageNote: 'Forecast is warmer than the mildest damage level the pack gives' }
  }
  const last = levels[levels.length - 1]
  if (tmin <= last.tempC) return { damageFraction: last.damageFraction, damageNote: null }
  for (let i = 0; i < levels.length - 1; i++) {
    const warm = levels[i]
    const cold = levels[i + 1]
    if (tmin <= warm.tempC && tmin > cold.tempC) {
      const share = (warm.tempC - tmin) / (warm.tempC - cold.tempC)
      return { damageFraction: warm.damageFraction + share * (cold.damageFraction - warm.damageFraction), damageNote: null }
    }
  }
  return { damageFraction: last.damageFraction, damageNote: null }
}
