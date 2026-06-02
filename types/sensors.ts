export type SensorType =
  | 'soil_moisture'
  | 'soil_ec'
  | 'soil_temp'
  | 'air_humidity'
  | 'wind'
  | 'rainfall'
  | 'multi'

export type SensorStatus = 'online' | 'offline' | 'unknown'

export interface Sensor {
  id: string
  farm_id: string
  block_id: string | null
  name: string
  device_id: string
  sensor_type: SensorType
  api_key: string
  status: SensorStatus
  last_seen_at: string | null
  location_notes: string | null
  created_at: string
}

export interface SensorWithBlock extends Sensor {
  block_name: string | null
}

export interface SensorFormValues {
  name: string
  device_id: string
  sensor_type: SensorType
  block_id: string | null
  location_notes: string | null
}

export interface SoilIngestPayload {
  moisture?: number
  ec?: number
  temp?: number
  ph?: number
  block_id?: string
  recorded_at?: string
}

export interface WeatherIngestPayload {
  temp_c?: number
  humidity_pct?: number
  rainfall_mm?: number
  wind_kmh?: number
  wind_direction?: string
  recorded_at?: string
}

export interface AlertIngestPayload {
  block_id: string
  domain: string
  severity: string
  message: string
}

export const SENSOR_TYPE_LABELS: Record<SensorType, string> = {
  soil_moisture: 'Soil Moisture',
  soil_ec:       'Soil EC',
  soil_temp:     'Soil Temperature',
  air_humidity:  'Air Humidity',
  wind:          'Wind Speed',
  rainfall:      'Rainfall',
  multi:         'Multi-Sensor',
}

export const SENSOR_TYPE_UNITS: Record<SensorType, string> = {
  soil_moisture: '%',
  soil_ec:       'dS/m',
  soil_temp:     '°C',
  air_humidity:  '%',
  wind:          'km/h',
  rainfall:      'mm',
  multi:         '—',
}
