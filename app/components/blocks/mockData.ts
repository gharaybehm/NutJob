import type {
  Block, BlockProfile,
  SoilWaterDomain, PhenologyDomain, NutritionDomain,
  PestDiseaseDomain, WeatherDomain,
} from './types';

// ─── Date shorthand ───────────────────────────────────────────────────────────

// Object spread copies keys whose value is `undefined`, so `{...defaults, ...o}`
// would let an override of `undefined` wipe out a default. Callers legitimately
// pass `undefined` for columns that are NULL in the database, so strip those
// keys before spreading and let the default stand.
function defined<T extends object>(o: Partial<T>): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

// ─── Domain factories (used by makeDefaultProfile & future Supabase adapter) ──

export function makeSoilWater(o: Partial<SoilWaterDomain> = {}): SoilWaterDomain {
  return {
    soilMoisture: 0, fieldCapacity: 38, wiltingPoint: 18,
    soilEC: 0, rootZoneTemp: 0, eto: 0, waterDeficit: 0,
    lastIrrigation: new Date(),
    nextIrrigationDue: new Date(),
    source: 'manual', alerts: [],
    ...defined(o),
  };
}

export function makePhenology(o: Partial<PhenologyDomain> = {}): PhenologyDomain {
  return {
    currentStage: 'dormancy',
    stageDescription: 'No phenology data recorded yet.',
    cumulativeGDD: 0, chillHours: 0,
    budBreakDate: null,
    estimatedHarvestStart: null,
    estimatedHarvestEnd: null,
    daysToHullSplit: 0,
    source: 'manual', alerts: [],
    ...defined(o),
  };
}

export function makeNutrition(o: Partial<NutritionDomain> = {}): NutritionDomain {
  return {
    source: 'manual', alerts: [],
    ...defined(o),
  };
}

export function makePestDisease(o: Partial<PestDiseaseDomain> = {}): PestDiseaseDomain {
  return {
    overallRisk: 'green',
    lastScouting: new Date(),
    nextScouting: new Date(),
    observations: [], source: 'manual', alerts: [],
    ...defined(o),
  };
}

export function makeWeather(o: Partial<WeatherDomain> = {}): WeatherDomain {
  return {
    currentTemp: 0, currentHumidity: 0, currentWind: 0,
    windDirection: '—', rainfall7d: 0, frostRisk: false, heatStressRisk: false,
    source: 'forecast', alerts: [], forecast: [],
    ...defined(o),
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
