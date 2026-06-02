import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { authenticateSensor, updateSensorHeartbeat } from '../_auth'
import type { WeatherIngestPayload } from '@/types/sensors'

export async function POST(request: Request) {
  const { sensor, error: authError } = await authenticateSensor(request)
  if (!sensor) return NextResponse.json({ error: authError }, { status: 401 })

  let body: WeatherIngestPayload
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { temp_c, humidity_pct, rainfall_mm, wind_kmh, wind_direction } = body
  if (temp_c == null && humidity_pct == null && rainfall_mm == null && wind_kmh == null) {
    return NextResponse.json({ error: 'At least one measurement required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error: insertError } = await (admin as any).from('weather_snapshots').insert({
    block_id: sensor.block_id,
    sensor_id: sensor.id,
    temp_c: temp_c ?? null,
    humidity_pct: humidity_pct ?? null,
    rainfall_mm: rainfall_mm ?? null,
    wind_kmh: wind_kmh ?? null,
    wind_direction: wind_direction ?? null,
    frost_risk: temp_c != null ? temp_c <= 0 : false,
    heat_stress_risk: temp_c != null ? temp_c > 38 : false,
    source: 'sensor',
    recorded_at: body.recorded_at ?? new Date().toISOString(),
  })

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  await updateSensorHeartbeat(sensor.id)
  return NextResponse.json({ ok: true })
}
