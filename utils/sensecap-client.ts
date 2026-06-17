// SenseCAP Open API HTTP client
// Docs: https://sensecap.seeed.cc/openapi
// Auth: HTTP Basic — API ID as username, Access Key as password
// Global station (LoRaWAN): https://sensecap.seeed.cc/openapi

const SENSECAP_HOST = "https://sensecap.seeed.cc/openapi";

// ─── SenseCAP API response types ─────────────────────────────────────────────

interface SensecapPoint {
  measurement_value: number;
  measurement_id: string;
  time: string; // ISO 8601
}

interface SensecapChannel {
  channel_index: number;
  points: SensecapPoint[];
}

interface SensecapTelemetryResponse {
  code: string;
  data: SensecapChannel[];
}

interface SensecapDeviceStatus {
  device_eui: string;
  latest_message_time: string;
  online_status: 0 | 1; // 0=offline, 1=online
  battery_status: 0 | 1; // 0=low, 1=good
  report_frequency: number; // minutes; -1 if unknown
}

interface SensecapStatusResponse {
  code: string;
  data: SensecapDeviceStatus[];
}

interface SensecapOrgResponse {
  code: string;
  data: { org_id: string };
}

// ─── Measurement ID → our schema mapping ─────────────────────────────────────
//
// SenseCAP sensor types relevant for almond farms:
//   1001  Air Temperature & Humidity  → 4097 (temp_c), 4098 (humidity_pct)
//   1006  Soil Moisture & Temp        → 4102 (root_zone_temp), 4103 (soil_moisture %RH)
//   1008  Wind Direction              → 4104 (wind_direction °)
//   1009  Wind Speed                  → 4105 (wind_kmh — raw m/s × 3.6)
//   1011  Rain Gauge                  → 4113 (rainfall_mm mm/hour)
//   100C  EC Sensor                   → 4108 (soil_ec dS/m)
//   100E  Soil VWC & EC               → 4108 (soil_ec), 4102 (root_zone_temp), 4110 (soil_moisture %)
//   2001  Compact Weather Station 5in1 → 4097,4098,4101,4104,4105
//   2007  Soil Temp & VWC             → 4110 (soil_moisture VWC %), 4102 (root_zone_temp)

export type SoilFields = {
  soil_moisture?: number;
  soil_ec?: number;
  root_zone_temp?: number;
  ph?: number;
};

export type WeatherFields = {
  temp_c?: number;
  humidity_pct?: number;
  wind_kmh?: number;
  wind_direction?: number;
  rainfall_mm?: number;
};

interface MeasurementDef {
  table: "soil" | "weather";
  field: keyof SoilFields | keyof WeatherFields;
  transform?: (v: number) => number;
}

export const MEASUREMENT_MAP: Record<string, MeasurementDef> = {
  "4097": { table: "weather", field: "temp_c" },
  "4098": { table: "weather", field: "humidity_pct" },
  // 4101 barometric pressure — not in current schema, skipped
  "4102": { table: "soil",    field: "root_zone_temp" },
  "4103": { table: "soil",    field: "soil_moisture" },           // %RH
  "4104": { table: "weather", field: "wind_direction" },
  "4105": { table: "weather", field: "wind_kmh", transform: (v) => Math.round(v * 3.6 * 10) / 10 }, // m/s → km/h
  "4106": { table: "soil",    field: "ph" },
  "4108": { table: "soil",    field: "soil_ec" },                 // dS/m
  "4110": { table: "soil",    field: "soil_moisture" },           // VWC % (preferred over 4103)
  "4111": { table: "soil",    field: "soil_ec" },                 // dS/m (alt EC channel)
  "4113": { table: "weather", field: "rainfall_mm" },             // mm/hour reading
};

// ─── Client ───────────────────────────────────────────────────────────────────

export class SensecapClient {
  private authHeader: string;

  constructor(apiId: string, accessKey: string) {
    this.authHeader = "Basic " + Buffer.from(`${apiId}:${accessKey}`).toString("base64");
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${SENSECAP_HOST}${path}`, {
      headers: { Authorization: this.authHeader },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`SenseCAP API error ${res.status}: ${await res.text()}`);
    }
    const json = await res.json();
    if (json.code !== "0") {
      throw new Error(`SenseCAP error ${json.code}: ${json.msg ?? "unknown"}`);
    }
    return json as T;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${SENSECAP_HOST}${path}`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`SenseCAP API error ${res.status}: ${await res.text()}`);
    }
    const json = await res.json();
    if (json.code !== "0") {
      throw new Error(`SenseCAP error ${json.code}: ${json.msg ?? "unknown"}`);
    }
    return json as T;
  }

  /** Verify credentials — returns org ID or throws. */
  async verifyConnection(): Promise<string> {
    const res = await this.get<SensecapOrgResponse>("/view_organization");
    return res.data.org_id;
  }

  /**
   * Fetch the most recent telemetry data point for a device.
   * Returns all channels / measurement types the device has reported.
   */
  async fetchLatestTelemetry(deviceEui: string): Promise<SensecapChannel[]> {
    const res = await this.get<SensecapTelemetryResponse>(
      `/view_latest_telemetry_data?device_eui=${encodeURIComponent(deviceEui)}`
    );
    return res.data ?? [];
  }

  /**
   * Fetch online/battery status for up to 50 devices at once.
   */
  async fetchDeviceStatus(deviceEuis: string[]): Promise<SensecapDeviceStatus[]> {
    if (deviceEuis.length === 0) return [];
    const res = await this.post<SensecapStatusResponse>("/view_device_running_status", {
      device_euis: deviceEuis,
    });
    return res.data ?? [];
  }
}

export function createSensecapClient(apiId: string, accessKey: string): SensecapClient {
  return new SensecapClient(apiId, accessKey);
}

// ─── Telemetry → payload mapping ─────────────────────────────────────────────

/**
 * Converts SenseCAP telemetry channels into typed soil/weather payloads.
 * A single device may contribute to both (e.g. a weather station with soil probe).
 */
export function mapTelemetryToPayloads(channels: SensecapChannel[]): {
  soil: SoilFields & { recorded_at: string | null };
  weather: WeatherFields & { recorded_at: string | null };
} {
  const soil: SoilFields & { recorded_at: string | null } = { recorded_at: null };
  const weather: WeatherFields & { recorded_at: string | null } = { recorded_at: null };

  for (const channel of channels) {
    for (const point of channel.points ?? []) {
      const def = MEASUREMENT_MAP[point.measurement_id];
      if (!def) continue;

      const value = def.transform ? def.transform(point.value ?? point.measurement_value) : (point.value ?? point.measurement_value);
      const ts = point.time;

      if (def.table === "soil") {
        (soil as Record<string, unknown>)[def.field] = value;
        if (!soil.recorded_at || ts > soil.recorded_at) soil.recorded_at = ts;
      } else {
        (weather as Record<string, unknown>)[def.field] = value;
        if (!weather.recorded_at || ts > weather.recorded_at) weather.recorded_at = ts;
      }
    }
  }

  return { soil, weather };
}
