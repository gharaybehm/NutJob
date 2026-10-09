/**
 * Degree-days: a registry of calculation methods (CDSS spec §A4.3).
 *
 * A pest, disease or phenology model is only valid with the method it was
 * built on, so every pack model declares its method, cutoff, thresholds and
 * units, and this module computes exactly that. The reference method is
 * single sine with a horizontal upper cutoff (Zalom et al. 1983, as used by
 * UC IPM).
 *
 * Every method is expressed through two quantities for a threshold `th`:
 * the degree-days above `th` with no upper cutoff, and the fraction of the
 * day spent above `th`. The three cutoffs then follow (Zalom et al. 1983):
 *   horizontal   = above(lower) - above(upper)
 *   intermediate = above(lower) - 2 * above(upper)
 *   vertical     = above(lower) - above(upper) - (upper - lower) * fractionAbove(upper)
 */

import { convertTemperature, type TemperatureUnit } from './units'

export type DegreeDayMethod = 'single_sine' | 'single_triangle' | 'averaging'
export type DegreeDayCutoff = 'horizontal' | 'vertical' | 'intermediate'

export interface DegreeDayModel {
  method: DegreeDayMethod
  cutoff: DegreeDayCutoff
  lower: number
  /** No upper threshold when null. */
  upper: number | null
  /** Units of the thresholds and of the result. */
  units: TemperatureUnit
}

interface Curve {
  above(tmin: number, tmax: number, th: number): number
  fractionAbove(tmin: number, tmax: number, th: number): number
}

const CURVES: Record<DegreeDayMethod, Curve> = {
  single_sine: {
    above(tmin, tmax, th) {
      if (tmax <= th) return 0
      const m = (tmax + tmin) / 2
      if (tmin >= th) return m - th
      const a = (tmax - tmin) / 2
      const t = Math.asin((th - m) / a)
      return ((m - th) * (Math.PI / 2 - t) + a * Math.cos(t)) / Math.PI
    },
    fractionAbove(tmin, tmax, th) {
      if (tmax <= th) return 0
      if (tmin >= th) return 1
      const m = (tmax + tmin) / 2
      const a = (tmax - tmin) / 2
      return (Math.PI / 2 - Math.asin((th - m) / a)) / Math.PI
    },
  },
  single_triangle: {
    above(tmin, tmax, th) {
      if (tmax <= th) return 0
      if (tmin >= th) return (tmax + tmin) / 2 - th
      return Math.pow(tmax - th, 2) / (2 * (tmax - tmin))
    },
    fractionAbove(tmin, tmax, th) {
      if (tmax <= th) return 0
      if (tmin >= th) return 1
      return (tmax - th) / (tmax - tmin)
    },
  },
  averaging: {
    above(tmin, tmax, th) {
      return Math.max(0, (tmax + tmin) / 2 - th)
    },
    fractionAbove(tmin, tmax, th) {
      return (tmax + tmin) / 2 > th ? 1 : 0
    },
  },
}

export const DEGREE_DAY_METHODS = Object.keys(CURVES) as DegreeDayMethod[]
export const DEGREE_DAY_CUTOFFS: DegreeDayCutoff[] = ['horizontal', 'vertical', 'intermediate']

/** Daily degree-days for temperatures already in the model's units. */
export function degreeDays(
  tmin: number,
  tmax: number,
  model: Pick<DegreeDayModel, 'method' | 'cutoff' | 'lower' | 'upper'>,
): number {
  if (tmax < tmin) throw new Error('tmax < tmin')
  const curve = CURVES[model.method]
  if (!curve) throw new Error(`unknown degree-day method: ${model.method}`)
  const { lower, upper } = model
  const base = curve.above(tmin, tmax, lower)
  if (upper === null) return base
  if (upper <= lower) throw new Error('upper threshold must be above lower threshold')
  const over = curve.above(tmin, tmax, upper)
  switch (model.cutoff) {
    case 'horizontal':
      return base - over
    case 'intermediate':
      return Math.max(0, base - 2 * over)
    case 'vertical':
      return Math.max(0, base - over - (upper - lower) * curve.fractionAbove(tmin, tmax, upper))
    default:
      throw new Error(`unknown degree-day cutoff: ${model.cutoff}`)
  }
}

/** Daily degree-days from stored °C temperatures, in the model's units. */
export function degreeDaysFromCelsius(tminC: number, tmaxC: number, model: DegreeDayModel): number {
  return degreeDays(
    convertTemperature(tminC, 'C', model.units),
    convertTemperature(tmaxC, 'C', model.units),
    model,
  )
}

/** Accumulated degree-days over a run of days (°C inputs), in the model's units. */
export function accumulateDegreeDays(days: { tminC: number; tmaxC: number }[], model: DegreeDayModel): number {
  return days.reduce((sum, d) => sum + degreeDaysFromCelsius(d.tminC, d.tmaxC, model), 0)
}
