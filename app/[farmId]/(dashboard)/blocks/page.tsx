import { createClient } from '@/utils/supabase/server';
import BlocksPage from '@/app/components/blocks/BlocksPage';
import type { Block, BlockProfile, GrowthStage, DataSource, BlockAlert, AgroDomain, AlertSeverity } from '@/app/components/blocks/types';
import { makeSoilWater, makeNutrition, makePestDisease, makeWeather, makePhenology } from '@/app/components/blocks/mockData';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Blocks — NutJob',
  description: 'Per-block live agronomic profile across soil & water, phenology, nutrition, pest & disease, and weather domains.',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToBlock(row: any): Block {
  return {
    id:           row.id,
    name:         row.name,
    cropType:     row.crop_type || 'Almond',
    variety:      row.variety,
    area:         Number(row.area),
    areaUnit:     row.area_unit || 'Dunm',
    plantingYear: Number(row.planting_year),
    rootstock:    row.rootstock,
    treeCount:    Number(row.tree_count),
    rowSpacing:   Number(row.row_spacing),
    treeSpacing:  Number(row.tree_spacing),
    status:       'green',
    alerts:       [],
    mapPos: {
      col:     Number(row.map_col),
      row:     Number(row.map_row),
      colSpan: Number(row.map_col_span) || 1,
      rowSpan: Number(row.map_row_span) || 1,
    },
    boundary: row.boundary ?? undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function alertRowToBlockAlert(row: any): BlockAlert {
  return {
    id: row.id,
    domain: row.domain as AgroDomain,
    severity: row.severity as AlertSeverity,
    message: row.message,
    source: (row.source ?? 'manual') as DataSource,
    timestamp: new Date(row.created_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseForecastJson(raw: unknown): any[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw;
}

export default async function BlocksRoute({ params }: { params: Promise<{ farmId: string }> }) {
  const { farmId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data, error } = await db
    .from('blocks')
    .select('id, name, crop_type, variety, area, area_unit, planting_year, rootstock, tree_count, row_spacing, tree_spacing, map_col, map_row, map_col_span, map_row_span, boundary')
    .eq('farm_id', farmId)
    .order('map_row')
    .order('map_col');

  const initialBlocks: Block[] = error || !data ? [] : data.map(rowToBlock);

  // Fetch farm GPS center for the satellite map
  const { data: farm } = await db.from('farms')
    .select('gps_lat, gps_lng, gps_zoom')
    .eq('id', farmId)
    .single();
  const farmCenter = farm?.gps_lat != null && farm?.gps_lng != null
    ? { lat: farm.gps_lat as number, lng: farm.gps_lng as number, zoom: (farm.gps_zoom as number) ?? 15 }
    : undefined;

  // Build initialProfiles from real DB data (4 queries in parallel)
  const blockIds = initialBlocks.map(b => b.id);
  let initialProfiles: Record<string, BlockProfile> | undefined;

  if (blockIds.length > 0) {
    const [soilRes, phenoRes, weatherRes, alertsRes, sensorsRes] = await Promise.all([
      db.from('soil_water_latest')
        .select('block_id, eto, water_deficit, soil_moisture, soil_ec, root_zone_temp, ph, source, recorded_at, field_capacity, wilting_point')
        .in('block_id', blockIds),
      db.from('phenology_latest')
        .select('block_id, cumulative_gdd, chill_hours, current_stage, stage_description, bud_break_date, estimated_harvest_start, estimated_harvest_end, days_to_hull_split, source, recorded_at')
        .in('block_id', blockIds),
      db.from('weather_latest')
        .select('block_id, temp_c, humidity_pct, wind_kmh, wind_direction, rainfall_7d_mm, rainfall_mm, frost_risk, heat_stress_risk, forecast_json, source, recorded_at')
        .in('block_id', blockIds),
      supabase.from('block_alerts')
        .select('id, block_id, domain, severity, message, source, created_at')
        .in('block_id', blockIds)
        .eq('resolved', false)
        .order('created_at', { ascending: false }),
      db.from('sensors')
        .select('id, block_id, status, last_seen_at')
        .eq('farm_id', farmId)
        .not('block_id', 'is', null),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const soilMap: Record<string, any> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (soilRes.data ?? []) as any[]) soilMap[r.block_id] = r;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const phenoMap: Record<string, any> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (phenoRes.data ?? []) as any[]) phenoMap[r.block_id] = r;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const weatherMap: Record<string, any> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (weatherRes.data ?? []) as any[]) weatherMap[r.block_id] = r;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alertsByBlock: Record<string, any[]> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (alertsRes.data ?? []) as any[]) {
      if (!alertsByBlock[a.block_id]) alertsByBlock[a.block_id] = [];
      alertsByBlock[a.block_id].push(a);
    }

    const sensorCountByBlock: Record<string, number> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of (sensorsRes.data ?? []) as any[]) {
      if (s.block_id) sensorCountByBlock[s.block_id] = (sensorCountByBlock[s.block_id] ?? 0) + 1;
    }

    initialProfiles = {};
    for (const block of initialBlocks) {
      const soil = soilMap[block.id];
      const pheno = phenoMap[block.id];
      const wx = weatherMap[block.id];
      const blockAlerts = (alertsByBlock[block.id] ?? []).map(alertRowToBlockAlert);

      initialProfiles[block.id] = {
        block,
        soilWater: makeSoilWater({
          soilMoisture:     soil?.soil_moisture  ?? 0,
          fieldCapacity:    soil?.field_capacity ?? 38,
          wiltingPoint:     soil?.wilting_point  ?? 18,
          soilEC:           soil?.soil_ec        ?? 0,
          rootZoneTemp:     soil?.root_zone_temp ?? 0,
          eto:              soil?.eto            ?? 0,
          waterDeficit:     soil?.water_deficit  ?? 0,
          source:           (soil?.source as DataSource) ?? 'computed',
          lastReadingAt:    soil?.recorded_at ? new Date(soil.recorded_at) : undefined,
          alerts:           blockAlerts.filter(a => a.domain === 'soil-water'),
        }),
        phenology: makePhenology({
          currentStage:        (pheno?.current_stage as GrowthStage) ?? 'dormancy',
          stageDescription:    pheno?.stage_description ?? 'No phenology data yet.',
          cumulativeGDD:       pheno?.cumulative_gdd   ?? 0,
          chillHours:          pheno?.chill_hours      ?? 0,
          budBreakDate:        pheno?.bud_break_date        ? new Date(pheno.bud_break_date)        : undefined,
          estimatedHarvestStart: pheno?.estimated_harvest_start ? new Date(pheno.estimated_harvest_start) : undefined,
          estimatedHarvestEnd:   pheno?.estimated_harvest_end   ? new Date(pheno.estimated_harvest_end)   : undefined,
          daysToHullSplit:     pheno?.days_to_hull_split ?? 0,
          source:              (pheno?.source as DataSource) ?? 'computed',
          alerts:              blockAlerts.filter(a => a.domain === 'phenology'),
        }),
        nutrition:   makeNutrition({ alerts: blockAlerts.filter(a => a.domain === 'nutrition') }),
        pestDisease: makePestDisease({ alerts: blockAlerts.filter(a => a.domain === 'pest-disease') }),
        weather: makeWeather({
          currentTemp:      wx?.temp_c        ?? 0,
          currentHumidity:  wx?.humidity_pct  ?? 0,
          currentWind:      wx?.wind_kmh      ?? 0,
          windDirection:    wx?.wind_direction ?? '—',
          rainfall7d:       wx?.rainfall_7d_mm ?? wx?.rainfall_mm ?? 0,
          frostRisk:        wx?.frost_risk      ?? false,
          heatStressRisk:   wx?.heat_stress_risk ?? false,
          forecast:         parseForecastJson(wx?.forecast_json),
          source:           (wx?.source as DataSource) ?? 'forecast',
          alerts:           blockAlerts.filter(a => a.domain === 'weather'),
        }),
        sensorCount: sensorCountByBlock[block.id] ?? 0,
      };
    }
  }

  return (
    <BlocksPage
      initialBlocks={initialBlocks}
      initialProfiles={initialProfiles}
      userRole={profile?.role || 'worker'}
      farmId={farmId}
      farmCenter={farmCenter}
    />
  );
}
