/**
 * Runs a pack's own test suite (spec §B2 "Pack test suite", validation V6):
 * input-to-expected cases for the decision tables and models the pack
 * defines, evaluated with the platform's calculators and the pack's start
 * values.
 */

import { degreeDays } from '../core/degree-days'
import { frostRiskForNight } from '../core/frost'
import { infectionValueForDay, type HourlyWetness } from '../core/infection'
import { annualNutrientDemandKgHa } from '../core/nutrient-budget'
import { relativeYieldPct } from '../core/salinity'
import { assessWaterStatus } from '../core/water-status'
import { createPackContext, type PackContext } from './context'
import type { Pack, PackTestCase } from './schema'

export interface PackTestResult {
  id: string
  kind: PackTestCase['kind']
  /** The table or model the case exercises, as `<kind>:<id>`. */
  target: string
  passed: boolean
  message: string | null
}

const DEFAULT_TOLERANCE = 0.01

type Case = PackTestCase & Record<string, unknown>

function need<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`${what} not found`)
  return value
}

function near(actual: number | null | undefined, expected: unknown, tolerance: number, what: string): string | null {
  if (expected === null) return actual === null ? null : `${what}: expected none, got ${actual}`
  if (typeof expected !== 'number') return `${what}: the expected value must be a number`
  if (typeof actual !== 'number') return `${what}: expected ${expected}, got none`
  return Math.abs(actual - expected) <= tolerance ? null : `${what}: expected ${expected}, got ${actual}`
}

function same(actual: unknown, expected: unknown, what: string): string | null {
  return actual === expected ? null : `${what}: expected ${String(expected)}, got ${String(actual)}`
}

function runCase(c: Case, ctx: PackContext): { target: string; failures: (string | null)[] } {
  const pack = ctx.pack
  const tolerance = c.tolerance ?? DEFAULT_TOLERANCE
  const expect = (c.expect ?? {}) as Record<string, unknown>

  switch (c.kind) {
    case 'table': {
      const tableId = String(c.table)
      const trace = ctx.evaluate(tableId, (c.state ?? {}) as Record<string, unknown>)
      const failures = [same(trace.rowId, expect.row, 'row')]
      if ('action' in expect) failures.push(same(trace.then?.action, expect.action, 'action'))
      if ('amount' in expect) failures.push(near(trace.amount, expect.amount, tolerance, 'amount'))
      if ('flag' in expect) failures.push(same(trace.then?.flag, expect.flag, 'flag'))
      return { target: `table:${tableId}`, failures }
    }
    case 'degree_days': {
      const pest = need(pack.pests?.pests.find(p => p.id === c.pest), `pest "${String(c.pest)}"`)
      const dd = degreeDays(Number(c.tmin), Number(c.tmax), pest.degree_days)
      return { target: `degree_days:${pest.id}`, failures: [near(dd, c.expect, tolerance, 'degree-days')] }
    }
    case 'infection': {
      const disease = need(pack.diseases?.diseases.find(d => d.id === c.disease), `disease "${String(c.disease)}"`)
      if (disease.type !== 'infection_value') throw new Error(`disease "${disease.id}" is not an infection-value model`)
      const hourly: HourlyWetness[] = []
      for (const run of c.hours as { count: number; temp: number; wet: boolean }[]) {
        for (let i = 0; i < run.count; i++) hourly.push({ temp: run.temp, wet: run.wet })
      }
      const value = infectionValueForDay(hourly, {
        bands: disease.bands,
        dryHoursSplit: disease.dry_hours_split,
        aggregate: disease.aggregate,
      })
      return { target: `infection:${disease.id}`, failures: [near(value, c.expect, tolerance, 'infection value')] }
    }
    case 'relative_yield': {
      const salinity = need(pack.salinity, 'salinity section')
      const value = relativeYieldPct(Number(c.ece), ctx.resolve(salinity.threshold_ece), ctx.resolve(salinity.slope_pct_per_ds_m))
      return { target: 'relative_yield:salinity', failures: [near(value, c.expect, tolerance, 'relative yield')] }
    }
    case 'nutrient_demand': {
      const nutrition = need(pack.nutrition, 'nutrition section')
      const nutrient = need(nutrition.nutrients.find(n => n.id === c.nutrient), `nutrient "${String(c.nutrient)}"`)
      const value = annualNutrientDemandKgHa({
        expectedYieldKgHa: Number(c.expected_yield_kg_ha),
        removalKgPerKg: ctx.resolve(nutrient.removal_kg_per_kg_yield),
        growthKgHa: Number(c.growth_kg_ha ?? 0),
        creditsKgHa: Number(c.credits_kg_ha ?? 0),
        efficiency: ctx.resolve(nutrition.efficiency),
      })
      return { target: `nutrient_demand:${nutrient.id}`, failures: [near(value, c.expect, tolerance, 'annual demand')] }
    }
    case 'phase_shares': {
      const nutrient = need(pack.nutrition?.nutrients.find(n => n.id === c.nutrient), `nutrient "${String(c.nutrient)}"`)
      const shares = need(nutrient.phase_shares, `phase shares for "${nutrient.id}"`)
      const total = shares.reduce((sum, s) => sum + ctx.resolve(s.share), 0)
      return { target: `phase_shares:${nutrient.id}`, failures: [near(total, 1, 1e-6, 'sum of phase shares')] }
    }
    case 'frost': {
      const frost = need(pack.frost, 'frost section')
      const stage = need(frost.stages.find(s => s.id === c.stage), `frost stage "${String(c.stage)}"`)
      const levels = (typeof c.variety === 'string' && stage.by_variety[c.variety]) || stage.critical
      const risk = frostRiskForNight({
        forecastMinC: Number(c.forecast_min_c),
        uncertaintyC: Number(c.uncertainty_c ?? 0),
        warningMarginC: Number(c.warning_margin_c),
        watchMarginC: Number(c.watch_margin_c),
        critical: levels.map(l => ({ tempC: ctx.resolve(l.temp_c), damageFraction: l.damage_fraction })),
      })
      const failures = [same(risk?.level, expect.level, 'level')]
      if ('critical_c' in expect) failures.push(near(risk?.criticalC, expect.critical_c, tolerance, 'critical temperature'))
      if ('damage_fraction' in expect) failures.push(near(risk?.damageFraction, expect.damage_fraction, tolerance, 'damage fraction'))
      return { target: `frost:${stage.id}`, failures }
    }
    case 'water_status': {
      const status = need(pack.water?.plant_water_status, 'plant water status model')
      const result = assessWaterStatus(
        Number(c.reading),
        { indicator: status.indicator, unit: status.unit, baselineExpression: status.baseline.expression },
        (c.weather ?? {}) as Record<string, unknown>,
        ctx.params,
      )
      return {
        target: 'water_status:plant_water_status',
        failures: [
          near(result.baseline, expect.baseline, tolerance, 'baseline'),
          near(result.deviation, expect.deviation, tolerance, 'deviation'),
        ],
      }
    }
  }
}

export function runPackTests(pack: Pack): PackTestResult[] {
  const ctx = createPackContext(pack)
  return pack.tests.map(testCase => {
    const c = testCase as Case
    try {
      const { target, failures } = runCase(c, ctx)
      const messages = failures.filter((f): f is string => f !== null)
      return { id: c.id, kind: c.kind, target, passed: messages.length === 0, message: messages.join('; ') || null }
    } catch (e) {
      return { id: c.id, kind: c.kind, target: c.kind, passed: false, message: (e as Error).message }
    }
  })
}
