/**
 * Hourly weather for the decision engines, from Open-Meteo: recent hours and
 * the forecast in one call. The values are modelled for the location, not
 * measured on the farm, and are labelled so.
 *
 * Penman-Monteith needs solar radiation, humidity and wind; chill and frost
 * need hourly temperature. None of these were stored before.
 */

import type { HourlyWeatherPoint } from '@/engines/decision/weather'

const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast'
const HOURLY_VARS = [
  'temperature_2m',
  'relative_humidity_2m',
  'wind_speed_10m',
  'shortwave_radiation',
  'precipitation',
  'precipitation_probability',
  'dew_point_2m',
].join(',')

/** The forecast endpoint serves at most this many past days. */
export const MAX_PAST_DAYS = 92

export interface HourlyWeatherRow extends HourlyWeatherPoint {
  /** The hour as a UTC timestamp. */
  at: string
  dewPointC: number | null
}

export interface HourlyWeatherFetch {
  rows: HourlyWeatherRow[]
  /** Elevation of the location in the weather service's terrain model, m. */
  elevationM: number | null
  /** The farm-local date at the time of the request. */
  localToday: string
  /** Farm-local time minus UTC, in minutes. */
  utcOffsetMinutes: number
}

interface OpenMeteoHourly {
  time?: string[]
  temperature_2m?: (number | null)[]
  relative_humidity_2m?: (number | null)[]
  wind_speed_10m?: (number | null)[]
  shortwave_radiation?: (number | null)[]
  precipitation?: (number | null)[]
  precipitation_probability?: (number | null)[]
  dew_point_2m?: (number | null)[]
}

/** Turns an Open-Meteo response (timezone=auto, wind in m/s) into rows. Exported for tests. */
export function parseHourlyResponse(json: unknown, now: Date): HourlyWeatherFetch {
  const body = (json ?? {}) as { hourly?: OpenMeteoHourly; utc_offset_seconds?: number; elevation?: number }
  const h = body.hourly
  const offsetMs = (body.utc_offset_seconds ?? 0) * 1000
  const localToday = new Date(now.getTime() + offsetMs).toISOString().slice(0, 10)
  const utcOffsetMinutes = offsetMs / 60_000
  if (!h?.time?.length) return { rows: [], elevationM: body.elevation ?? null, localToday, utcOffsetMinutes }

  const rows = h.time.map((t, i) => {
    // timezone=auto returns local wall-clock times with no offset, such as 2026-05-10T14:00.
    const utcMs = Date.parse(`${t}:00Z`) - offsetMs
    return {
      at: new Date(utcMs).toISOString(),
      localDate: t.slice(0, 10),
      localHour: Number(t.slice(11, 13)),
      tempC: h.temperature_2m?.[i] ?? null,
      rhPct: h.relative_humidity_2m?.[i] ?? null,
      wind10mMs: h.wind_speed_10m?.[i] ?? null,
      shortwaveWm2: h.shortwave_radiation?.[i] ?? null,
      precipMm: h.precipitation?.[i] ?? null,
      precipProbPct: h.precipitation_probability?.[i] ?? null,
      dewPointC: h.dew_point_2m?.[i] ?? null,
      // Radiation and rain are totals for the hour ending at the timestamp, so an hour counts as past once it has ended.
      forecast: utcMs > now.getTime(),
    }
  })
  return { rows, elevationM: typeof body.elevation === 'number' ? body.elevation : null, localToday, utcOffsetMinutes }
}

/** Returns null when the weather service cannot be reached or answers with an error. */
export async function fetchHourlyWeather(
  lat: number,
  lng: number,
  pastDays: number,
  forecastDays: number,
  now: Date = new Date(),
): Promise<HourlyWeatherFetch | null> {
  const url = new URL(FORECAST_BASE)
  url.searchParams.set('latitude', lat.toFixed(4))
  url.searchParams.set('longitude', lng.toFixed(4))
  url.searchParams.set('hourly', HOURLY_VARS)
  url.searchParams.set('wind_speed_unit', 'ms')
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('past_days', String(Math.max(1, Math.min(MAX_PAST_DAYS, Math.round(pastDays)))))
  url.searchParams.set('forecast_days', String(forecastDays))

  let res: Response
  try {
    res = await fetch(url.toString(), { cache: 'no-store' })
  } catch {
    return null
  }
  if (!res.ok) return null
  return parseHourlyResponse(await res.json(), now)
}
