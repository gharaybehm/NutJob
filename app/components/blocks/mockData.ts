import type {
  Block, BlockProfile,
  SoilWaterDomain, PhenologyDomain, NutritionDomain,
  PestDiseaseDomain, WeatherDomain, NutrientLevel,
} from './types';

// ─── Date shorthand ───────────────────────────────────────────────────────────

function d(y: number, mo: number, day: number, h = 0, min = 0): Date {
  return new Date(y, mo - 1, day, h, min);
}

// ─── Default nutrient reference ranges (almond tissue standards) ──────────────

const DEFAULT_NUTRIENTS: NutrientLevel[] = [
  { element: 'N',  value: 0, unit: '%',   low: 2.2, optimal: [2.2, 3.0], high: 3.5, status: 'green' },
  { element: 'P',  value: 0, unit: '%',   low: 0.1, optimal: [0.1, 0.3], high: 0.4, status: 'green' },
  { element: 'K',  value: 0, unit: '%',   low: 1.0, optimal: [1.0, 2.0], high: 2.5, status: 'green' },
  { element: 'Ca', value: 0, unit: '%',   low: 1.5, optimal: [1.5, 3.0], high: 3.5, status: 'green' },
  { element: 'Mg', value: 0, unit: '%',   low: 0.2, optimal: [0.2, 0.6], high: 0.8, status: 'green' },
  { element: 'B',  value: 0, unit: 'ppm', low: 20,  optimal: [20,  60],  high: 80,  status: 'green' },
];

// ─── Domain factories (used by makeDefaultProfile & future Supabase adapter) ──

export function makeSoilWater(o: Partial<SoilWaterDomain> = {}): SoilWaterDomain {
  return {
    soilMoisture: 0, fieldCapacity: 38, wiltingPoint: 18,
    soilEC: 0, rootZoneTemp: 0, eto: 0, waterDeficit: 0,
    lastIrrigation: new Date(),
    nextIrrigationDue: new Date(),
    source: 'manual', alerts: [],
    ...o,
  };
}

export function makePhenology(o: Partial<PhenologyDomain> = {}): PhenologyDomain {
  return {
    currentStage: 'dormancy',
    stageDescription: 'No phenology data recorded yet.',
    cumulativeGDD: 0, chillHours: 0,
    budBreakDate: d(new Date().getFullYear(), 2, 1),
    estimatedHarvestStart: d(new Date().getFullYear(), 8, 1),
    estimatedHarvestEnd: d(new Date().getFullYear(), 9, 1),
    daysToHullSplit: 0,
    source: 'manual', alerts: [],
    ...o,
  };
}

export function makeNutrition(o: Partial<NutritionDomain> = {}): NutritionDomain {
  return {
    nutrients: DEFAULT_NUTRIENTS,
    lastFertigation: { date: new Date(), fertilizerType: '—', amountKgPerTree: 0 },
    nextFertigation: new Date(),
    tissueSampleDate: new Date(),
    source: 'manual', alerts: [],
    ...o,
  };
}

export function makePestDisease(o: Partial<PestDiseaseDomain> = {}): PestDiseaseDomain {
  return {
    overallRisk: 'green',
    lastScouting: new Date(),
    nextScouting: new Date(),
    observations: [], source: 'manual', alerts: [],
    ...o,
  };
}

export function makeWeather(o: Partial<WeatherDomain> = {}): WeatherDomain {
  return {
    currentTemp: 0, currentHumidity: 0, currentWind: 0,
    windDirection: '—', rainfall7d: 0, frostRisk: false, heatStressRisk: false,
    source: 'forecast', alerts: [], forecast: [],
    ...o,
  };
}

// ─── Default profile factory (used when a new block is created in the UI) ─────

export function makeDefaultProfile(block: Block): BlockProfile {
  return {
    block,
    soilWater:   makeSoilWater(),
    phenology:   makePhenology(),
    nutrition:   makeNutrition(),
    pestDisease: makePestDisease(),
    weather:     makeWeather(),
  };
}

// ─── Seed data — empty until real blocks are added via the UI or Supabase ─────

export const BLOCK_PROFILES: Record<string, BlockProfile> = {};
export const ALL_BLOCKS: Block[] = [];
