/**
 * Fast-tier weather for the decision engines (CDSS spec §A2): hourly values
 * turned into the daily inputs the science core needs.
 */

import { windAt2m } from '../core/units'

export interface HourlyWeatherPoint {
  /** Farm-local calendar date (yyyy-mm-dd) and hour (0-23) of the observation. */
  localDate: string
  localHour: number
  tempC: number | null
  rhPct: number | null
  /** Mean wind speed at 10 m, m/s. */
  wind10mMs: number | null
  /** Mean incoming shortwave radiation over the hour, W/m2. */
  shortwaveWm2: number | null
  precipMm: number | null
  /** Probability of precipitation, 0-100; forecast hours only. */
  precipProbPct: number | null
  /** True for hours still in the future when the data was fetched. */
  forecast: boolean
  /** Leaf wetness for the hour, from a sensor; absent or null when not measured. */
  leafWet?: boolean | null
}

export interface DailyWeather {
  date: string
  tmax: number
  tmin: number
  rhmax: number
  rhmin: number
  /** Mean wind speed at 2 m, m/s. */
  wind2m: number
  /** Incoming solar radiation, MJ m-2 day-1. */
  rsMj: number
  rainMm: number
  /** Highest hourly probability of precipitation, 0-1; null when not forecast. */
  rainProb: number | null
  /** True when all 24 hours carried every value. */
  complete: boolean
  /** True when any hour of the day was a forecast. */
  forecast: boolean
}

const WIND_MEASUREMENT_HEIGHT_M = 10

/** One row per local day, in date order. Days with no usable hour are left out. */
export function aggregateDaily(hours: HourlyWeatherPoint[]): DailyWeather[] {
  const byDate = new Map<string, HourlyWeatherPoint[]>()
  for (const h of hours) {
    const list = byDate.get(h.localDate) ?? []
    list.push(h)
    byDate.set(h.localDate, list)
  }

  const days: DailyWeather[] = []
  for (const [date, list] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const full = list.filter(
      (h): h is HourlyWeatherPoint & { tempC: number; rhPct: number; wind10mMs: number; shortwaveWm2: number } =>
        h.tempC !== null && h.rhPct !== null && h.wind10mMs !== null && h.shortwaveWm2 !== null,
    )
    if (full.length === 0) continue
    const temps = full.map(h => h.tempC)
    const rhs = full.map(h => h.rhPct)
    const probs = list.map(h => h.precipProbPct).filter((p): p is number => p !== null)
    days.push({
      date,
      tmax: Math.max(...temps),
      tmin: Math.min(...temps),
      rhmax: Math.max(...rhs),
      rhmin: Math.min(...rhs),
      wind2m: windAt2m(full.reduce((s, h) => s + h.wind10mMs, 0) / full.length, WIND_MEASUREMENT_HEIGHT_M),
      rsMj: full.reduce((s, h) => s + h.shortwaveWm2, 0) * 0.0036,
      rainMm: list.reduce((s, h) => s + (h.precipMm ?? 0), 0),
      rainProb: probs.length > 0 ? Math.max(...probs) / 100 : null,
      complete: full.length === 24 && new Set(full.map(h => h.localHour)).size === 24,
      forecast: list.some(h => h.forecast),
    })
  }
  return days
}

/** Day of the year (1-366) of an ISO date. */
export function dayOfYear(date: string): number {
  const d = new Date(`${date}T00:00:00Z`)
  return Math.round((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1
}

/** The ISO date `days` after `date`. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

/** Whole days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}
