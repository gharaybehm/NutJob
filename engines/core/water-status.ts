/**
 * Plant water status against a non-stressed baseline (CDSS spec §A4.5).
 *
 * Given a reading (stem or leaf water potential, trunk diameter variation,
 * canopy temperature) and the weather at reading time, returns the baseline
 * a well-watered plant would show and the deviation from it. The indicator,
 * the baseline equation, its coefficients and the unit come from the pack.
 * When the pack has no baseline, the caller falls back to the pack's
 * absolute thresholds and confidence is reduced.
 */

import { evaluateExpression, parseExpression, type ExpressionScope } from '../rules/expression'

export interface WaterStatusModel {
  /** For example a pressure-chamber reading; named by the pack. */
  indicator: string
  unit: string
  /** Baseline equation over weather keys and `$parameters`; null when the pack has none. */
  baselineExpression: string | null
}

export interface WaterStatusResult {
  indicator: string
  unit: string
  reading: number
  /** Value expected from a non-stressed plant in the same weather; null without a baseline. */
  baseline: number | null
  /** reading - baseline; null without a baseline. */
  deviation: number | null
  basis: 'baseline' | 'absolute'
  /** True when no baseline was available and absolute thresholds must be used. */
  reducedConfidence: boolean
}

/**
 * `weather` holds the conditions at reading time under the names the pack's
 * equation uses. A missing input throws `MissingValueError`.
 */
export function assessWaterStatus(
  reading: number,
  model: WaterStatusModel,
  weather: ExpressionScope['state'],
  params: ExpressionScope['params'],
): WaterStatusResult {
  const common = { indicator: model.indicator, unit: model.unit, reading }
  if (model.baselineExpression === null) {
    return { ...common, baseline: null, deviation: null, basis: 'absolute', reducedConfidence: true }
  }
  const baseline = evaluateExpression(parseExpression(model.baselineExpression), { state: weather, params })
  return { ...common, baseline, deviation: reading - baseline, basis: 'baseline', reducedConfidence: false }
}
