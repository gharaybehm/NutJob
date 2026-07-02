/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Supabase client casts */
// Shared sensor authentication helper for ingest routes.
// Underscore prefix prevents Next.js from treating this as a route handler.

import { createAdminClient } from '@/utils/supabase/admin'

export interface SensorAuthResult {
  sensor: {
    id: string
    farm_id: string
    block_id: string | null
    sensor_type: string
    status: string
  } | null
  error: string | null
}

export async function authenticateSensor(request: Request): Promise<SensorAuthResult> {
  const apiKey = request.headers.get('X-Sensor-Key')
  if (!apiKey) return { sensor: null, error: 'Missing X-Sensor-Key header' }

  const admin = createAdminClient()
  const { data: sensor, error } = await (admin as any)
    .from('sensors')
    .select('id, farm_id, block_id, sensor_type, status')
    .eq('api_key', apiKey)
    .maybeSingle()

  if (error || !sensor) return { sensor: null, error: 'Invalid API key' }
  return { sensor, error: null }
}

export async function updateSensorHeartbeat(sensorId: string): Promise<void> {
  const admin = createAdminClient()
  await (admin as any)
    .from('sensors')
    .update({ last_seen_at: new Date().toISOString(), status: 'online' })
    .eq('id', sensorId)
}
