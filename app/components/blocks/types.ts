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

export interface Block {
  id: string;            // 'A' | 'B' | ...
  name: string;          // 'Block A'
  variety: string;       // 'Nonpareil'
  area: number;
  areaUnit: string;
  plantingYear: number;
  rootstock: string;
  treeCount: number;
  rowSpacing: number;    // metres
  treeSpacing: number;   // metres
  status: HealthStatus;
  alerts: BlockAlert[];
  // Grid position for the map (col/row zero-indexed)
  mapPos: { col: number; row: number; colSpan?: number; rowSpan?: number };
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
  budBreakDate: Date;
  estimatedHarvestStart: Date;
  estimatedHarvestEnd: Date;
  daysToHullSplit: number;
  source: DataSource;
  alerts: BlockAlert[];
}

// ─── Nutrition Domain ─────────────────────────────────────────────────────────

export interface NutrientLevel {
  element: string;          // 'N' | 'P' | 'K' | 'Ca' | 'Mg' | 'B'
  value: number;            // ppm or %
  unit: string;
  low: number;              // deficient below
  optimal: [number, number]; // optimal range
  high: number;             // excess above
  status: HealthStatus;
}

export interface FertigationRecord {
  date: Date;
  fertilizerType: string;
  amountKgPerTree: number;
  notes?: string;
}

export interface NutritionDomain {
  nutrients: NutrientLevel[];
  lastFertigation: FertigationRecord;
  nextFertigation: Date;
  tissueSampleDate: Date;
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
}
