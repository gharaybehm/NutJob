/* eslint-disable @typescript-eslint/no-explicit-any -- sensors and weather_snapshots predate the generated types */
'use server';

import { createClient } from '@/utils/supabase/server';
import { requireFarmRole } from '@/utils/supabase/farm-access';
import { fetchHourlyWeatherRange } from '@/utils/weather-history';
import { checkStation, type StationReport } from '@/engines/station-check';

const LOOKBACK_DAYS = 14;

export interface StationCheckResult {
  sensorId: string;
  sensorName: string;
  report: StationReport;
}

/**
 * Compares each of the farm's stations with Open-Meteo for the last two weeks:
 * temperature, humidity, wind speed and rain / no rain.
 * Verification only: it reads, compares and reports. It writes nothing and
 * changes nothing the recommendations use.
 */
export async function checkStationsAgainstOpenMeteo(farmId: string): Promise<{
  results: StationCheckResult[];
  windowDays: number;
  error?: string;
}> {
  const gate = await requireFarmRole(farmId, 'supervisor');
  if (!gate.ok) return { results: [], windowDays: LOOKBACK_DAYS, error: gate.error };

  const supabase = await createClient();
  const { data: farm } = await (supabase as any).from('farms').select('gps_lat, gps_lng').eq('id', farmId).maybeSingle();
  if (farm?.gps_lat == null || farm?.gps_lng == null) {
    return { results: [], windowDays: LOOKBACK_DAYS, error: 'The farm has no GPS coordinates, so there is no Open-Meteo location to compare against.' };
  }

  const { data: sensors } = await (supabase as any).from('sensors').select('id, name').eq('farm_id', farmId);
  if (!sensors || sensors.length === 0) {
    return { results: [], windowDays: LOOKBACK_DAYS, error: 'No sensors are registered for this farm yet.' };
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
  const { data: rows, error } = await (supabase as any)
    .from('weather_snapshots')
    .select('sensor_id, recorded_at, temp_c, humidity_pct, wind_kmh, rainfall_mm')
    .eq('source', 'sensor')
    .in('sensor_id', sensors.map((s: any) => s.id))
    .gte('recorded_at', since.toISOString())
    .order('recorded_at', { ascending: true })
    .limit(5000);
  if (error) return { results: [], windowDays: LOOKBACK_DAYS, error: error.message };

  // One Open-Meteo fetch for the whole window, shared by every sensor on the farm.
  const hourly = await fetchHourlyWeatherRange(
    Number(farm.gps_lat),
    Number(farm.gps_lng),
    since.toISOString().slice(0, 10),
    new Date().toISOString().slice(0, 10),
  );

  // Only sensors that have reported weather: a soil-only probe has nothing to compare.
  const reporting = new Set((rows ?? []).map((r: any) => r.sensor_id));
  const results: StationCheckResult[] = sensors.filter((s: any) => reporting.has(s.id)).map((s: any) => {
    const readings = (rows ?? [])
      .filter((r: any) => r.sensor_id === s.id)
      .map((r: any) => ({
        at: r.recorded_at as string,
        tempC: r.temp_c == null ? null : Number(r.temp_c),
        humidityPct: r.humidity_pct == null ? null : Number(r.humidity_pct),
        windKmh: r.wind_kmh == null ? null : Number(r.wind_kmh),
        rainMm: r.rainfall_mm == null ? null : Number(r.rainfall_mm),
      }));
    return { sensorId: s.id, sensorName: s.name, report: checkStation(readings, hourly) };
  });

  if (results.length > 0 && hourly.length === 0) {
    return { results, windowDays: LOOKBACK_DAYS, error: 'Open-Meteo could not be reached, so nothing could be compared. Try again shortly.' };
  }
  return { results, windowDays: LOOKBACK_DAYS };
}
