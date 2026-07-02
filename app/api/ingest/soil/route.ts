/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Supabase client casts */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { authenticateSensor, updateSensorHeartbeat } from '../_auth'
import type { SoilIngestPayload } from '@/types/sensors'

export async function POST(request: Request) {
  const { sensor, error: authError } = await authenticateSensor(request)
  if (!sensor) return NextResponse.json({ error: authError }, { status: 401 })

  let body: SoilIngestPayload
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { moisture, ec, temp, ph } = body
  if (moisture == null && ec == null && temp == null && ph == null) {
    return NextResponse.json({ error: 'At least one measurement required (moisture, ec, temp, ph)' }, { status: 400 })
  }

  const blockId = body.block_id ?? sensor.block_id
  if (!blockId) {
    return NextResponse.json({ error: 'Sensor has no block assignment and no block_id in payload' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error: insertError } = await (admin as any).from('soil_water_readings').insert({
    block_id: blockId,
    sensor_id: sensor.id,
    soil_moisture: moisture ?? null,
    soil_ec: ec ?? null,
    root_zone_temp: temp ?? null,
    ph: ph ?? null,
    source: 'sensor',
    test_type: 'sensor',
    recorded_at: body.recorded_at ?? new Date().toISOString(),
  })

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  await updateSensorHeartbeat(sensor.id)
  return NextResponse.json({ ok: true })
}
