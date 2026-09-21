/**
 * Weather risk engine (plan §9): stage- and variety-aware spring frost risk.
 *
 * Frost is the top risk for Central Anatolian almonds, and the late-blooming
 * Makako and Vairo lower the exposure without removing it. Forecast minimums
 * are uncertain, so the result carries a range and a margin, never one number.
 *
 * Thresholds are data with a stated source, not prompt text or RAG output.
 */

import { resolveVariety } from './varieties'

export type FrostLevel = 'none' | 'watch' | 'warning' | 'critical'
export type DamageBand = 'none' | 'lt10' | 'lt50' | 'lt90'
export type FrostBasis = 'variety_tested' | 'species_mean' | 'species_stage'

/** Lethal temperatures (°C): the temperature at which 10/50/90% of organs are damaged. */
export interface FrostThreshold {
  lt10: number
  lt50: number | null
  lt90: number | null
  basis: FrostBasis
  source: string
  caveat: string | null
}

const CALLE_2025 =
  'Calle et al. 2025, J. Agron. Crop Sci. 211:e70090 (IRTA, Lleida), Fig. 3, full bloom (Felipe stage F), combined 2016 and 2019'

/**
 * Full-bloom lethal temperatures from Calle et al. 2025 (controlled chamber,
 * cut branches, GF-677, IRTA Les Borges Blanques). Only tested varieties are
 * listed; Makako was NOT among the 20 cultivars.
 */
const BLOOM_TESTED: Record<string, { lt10: number; lt50: number; lt90: number }> = {
  vairo: { lt10: -3.46, lt50: -4.85, lt90: -6.25 },
}

/**
 * Mean of the 20 cultivars' full-bloom values (means computed from Fig. 3 of
 * Calle et al. 2025). Used for varieties that were not tested. The study's
 * range was LT10 −2.59 (Marta) to −3.49 (Lauranne).
 */
const BLOOM_SPECIES_MEAN = { lt10: -3.21, lt50: -4.18, lt90: -5.15 }

/**
 * Fruitlet stage (Felipe G–I: petal fall, fruit set, calyx fall). Species-level
 * only: Miranda et al. 2005, quoted in Calle et al. 2025 (LT10 −2.4 °C at the
 * most susceptible stage 'I'; LT90 −3.6 °C at 'I' for Marcona/Ferragnès). No
 * variety-specific fruitlet data exists for Vairo or Makako.
 */
const FRUITLET_SPECIES = { lt10: -2.4, lt90: -3.6 }

const LAB_CAVEAT =
  'Lethal temperatures come from cut branches held at the target temperature for 30 minutes in a chamber. Orchard frosts last hours and flower temperature differs from air temperature, so treat them as where damage starts, not as safe limits.'

/** Engine stage names mapped to the paper's scale (Felipe 1977): bloom = F, fruit_set = G to I. */
export function frostThresholdFor(stage: string | null, variety: string | null): FrostThreshold | null {
  if (stage === 'bloom') {
    const key = resolveVariety(variety).key
    const tested = BLOOM_TESTED[key]
    if (tested) {
      return { ...tested, basis: 'variety_tested', source: CALLE_2025, caveat: LAB_CAVEAT }
    }
    return {
      ...BLOOM_SPECIES_MEAN,
      basis: 'species_mean',
      source: CALLE_2025,
      caveat: `${variety ? `${variety} was not among the 20 cultivars tested` : 'Variety unknown'}: using the mean of the tested cultivars, not a value for this variety. ${LAB_CAVEAT}`,
    }
  }
  if (stage === 'fruit_set') {
    return {
      lt10: FRUITLET_SPECIES.lt10,
      lt50: null,
      lt90: FRUITLET_SPECIES.lt90,
      basis: 'species_stage',
      source: 'Miranda et al. 2005 (HortScience 40:357), as quoted in ' + CALLE_2025,
      caveat: `Species-level only, no variety-specific fruitlet data. ${LAB_CAVEAT}`,
    }
  }
  return null
}

export interface FrostDay {
  date: string
  tMin: number
}

export interface FrostDayRisk {
  date: string
  level: FrostLevel
  /** How far the central forecast is past the lethal temperatures. */
  band: DamageBand
  /** Central forecast minimum. */
  tMin: number
  tMinLow: number
  tMinHigh: number
}

export interface FrostRiskResult {
  level: FrostLevel
  applicable: boolean
  threshold: FrostThreshold | null
  marginC: number
  worstDay: FrostDayRisk | null
  days: FrostDayRisk[]
  notes: string[]
}

const RANK: Record<FrostLevel, number> = { none: 0, watch: 1, warning: 2, critical: 3 }

function bandFor(tMin: number, th: FrostThreshold): DamageBand {
  if (th.lt90 !== null && tMin <= th.lt90) return 'lt90'
  if (th.lt50 !== null && tMin <= th.lt50) return 'lt50'
  if (tMin <= th.lt10) return 'lt10'
  return 'none'
}

export function evaluateFrostRisk(
  stage: string | null,
  forecast: FrostDay[],
  options: { variety?: string | null; marginC?: number } = {},
): FrostRiskResult {
  const marginC = options.marginC ?? 2
  const threshold = frostThresholdFor(stage, options.variety ?? null)

  if (!threshold) {
    return {
      level: 'none',
      applicable: false,
      threshold: null,
      marginC,
      worstDay: null,
      days: [],
      notes: [stage == null ? 'Growth stage unknown, frost sensitivity not assessed' : 'Stage is not assessed for frost'],
    }
  }

  const days: FrostDayRisk[] = forecast.map(d => {
    let level: FrostLevel = 'none'
    if (d.tMin <= threshold.lt10) level = 'critical'
    else if (d.tMin <= threshold.lt10 + marginC) level = 'warning'
    else if (d.tMin <= threshold.lt10 + 2 * marginC) level = 'watch'
    return { date: d.date, level, band: bandFor(d.tMin, threshold), tMin: d.tMin, tMinLow: d.tMin - marginC, tMinHigh: d.tMin + marginC }
  })

  const worstDay = days.reduce<FrostDayRisk | null>(
    (worst, d) => (worst === null || RANK[d.level] > RANK[worst.level] ? d : worst),
    null,
  )

  const notes: string[] = []
  if (threshold.caveat) notes.push(threshold.caveat)
  if (threshold.basis !== 'variety_tested') notes.push('Not a value measured for this variety, confirm with the agronomist')

  return {
    level: worstDay?.level ?? 'none',
    applicable: true,
    threshold,
    marginC,
    worstDay: worstDay && worstDay.level !== 'none' ? worstDay : null,
    days,
    notes,
  }
}
