// ─── Status ───────────────────────────────────────────────────────────────────

export type HealthStatus = 'green' | 'amber' | 'red';
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type DataSource = 'sensor' | 'manual' | 'computed' | 'forecast';
export type AgroDomain = 'soil-water' | 'phenology' | 'nutrition' | 'pest-disease' | 'weather';

// ─── Alert ────────────────────────────────────────────────────────────────────

export interface BlockAlert {
  id: string;
  domain: AgroDomain;
  severity: AlertSeverity;
  message: string;
  source: DataSource;
  timestamp: Date;
}

// ─── Block (static metadata) ──────────────────────────────────────────────────

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Block {
  id: string;            // 'A' | 'B' | ...
  name: string;          // 'Block A'
  cropType: string;      // 'Almond', 'Apple', etc.
  variety: string;       // 'Nonpareil'
  area: number;
  areaUnit: string;
  plantingYear: number;
  /** YYYY-MM-DD when known; otherwise the year alone is read as Q4 of that year. */
  plantingDate?: string | null;
  rootstock: string;
  treeCount: number;
  rowSpacing: number;    // metres
  treeSpacing: number;   // metres
  status: HealthStatus;
  alerts: BlockAlert[];
  // Grid position for the map (col/row zero-indexed) — kept for backward compat
  mapPos: { col: number; row: number; colSpan?: number; rowSpan?: number };
  // GPS polygon boundary — set when user draws the block on the satellite map
  boundary?: LatLng[];
}

// ─── Soil & Water Domain ──────────────────────────────────────────────────────

export interface SoilWaterMetric {
  label: string;
  value: string | number;
  unit: string;
  source: DataSource;
  updatedAt: Date;
  status?: HealthStatus;
}

export interface SoilWaterDomain {
  soilMoisture: number;      // % vol
  fieldCapacity: number;     // % vol (threshold)
  wiltingPoint: number;      // % vol (lower threshold)
  soilEC: number;            // dS/m
  rootZoneTemp: number;      // °C
  eto: number;               // mm/day (computed)
  waterDeficit: number;      // mm (computed)
  lastIrrigation: Date;
  nextIrrigationDue: Date;
  source: DataSource;
  lastReadingAt?: Date;      // timestamp of the most recent sensor/computed reading
  alerts: BlockAlert[];
}

// ─── Phenology Domain ─────────────────────────────────────────────────────────

export type GrowthStage =
  | 'dormancy'
  | 'bud-swell'
  | 'bud-break'
  | 'bloom'
  | 'petal-fall'
  | 'nut-development'
  | 'hull-split'
  | 'harvest'
  | 'post-harvest';

export interface PhenologyDomain {
  currentStage: GrowthStage;
  stageDescription: string;
  cumulativeGDD: number;     // growing degree days since Jan 1
  chillHours: number;        // hours below 7°C since Nov 1
  // Null until a manual phenology record supplies them — the daily
  // compute-fields cron only writes GDD, chill hours and growth stage.
  budBreakDate: Date | null;
  estimatedHarvestStart: Date | null;
  estimatedHarvestEnd: Date | null;
  daysToHullSplit: number;
  /** Set when the trees are not bearing yet: no harvest window applies. */
  notBearing?: { label: string } | null;
  /** Set when the crop has no heat model: no stage, GDD or harvest estimate is shown (almond numbers are not reused). */
  noStageModel?: { crop: string } | null;
  source: DataSource;
  alerts: BlockAlert[];
}

// ─── Nutrition Domain ─────────────────────────────────────────────────────────

/** Leaf analyses and the last fertigation are read live by the Nutrition tab; this holds only what the page supplies. */
export interface NutritionDomain {
  source: DataSource;
  alerts: BlockAlert[];
}

// ─── Pest & Disease Domain ────────────────────────────────────────────────────

export interface PestObservation {
  id: string;
  pestName: string;
  commonName: string;
  riskLevel: HealthStatus;
  observedCount?: string;   // e.g. '3 per 100 leaves'
  stage: string;            // 'Active' | 'Monitoring' | 'Resolved'
  source: DataSource;
  lastSeen: Date;
  note?: string;
}

export interface PestDiseaseDomain {
  overallRisk: HealthStatus;
  lastScouting: Date;
  nextScouting: Date;
  observations: PestObservation[];
  source: DataSource;
  alerts: BlockAlert[];
}

// ─── Weather Domain ───────────────────────────────────────────────────────────

export interface WeatherHour {
  time: Date;
  temp: number;       // °C
  humidity: number;   // %
  wind: number;       // km/h
  precip: number;     // mm
  condition: string;
}

export interface WeatherDomain {
  currentTemp: number;
  currentHumidity: number;
  currentWind: number;        // km/h
  windDirection: string;
  rainfall7d: number;         // mm
  frostRisk: boolean;
  heatStressRisk: boolean;
  forecast: WeatherHour[];    // next 24 h, 3-hr intervals
  source: DataSource;
  alerts: BlockAlert[];
}

// ─── Full Block Profile ───────────────────────────────────────────────────────

export interface BlockProfile {
  block: Block;
  soilWater: SoilWaterDomain;
  phenology: PhenologyDomain;
  nutrition: NutritionDomain;
  pestDisease: PestDiseaseDomain;
  weather: WeatherDomain;
  sensorCount?: number;        // number of sensors currently assigned to this block
}
