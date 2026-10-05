/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Supabase client casts, same convention as ./actions.ts */
// Gathers one farm's health signals for the platform admin. Not a server-action
// file: it takes the service-role client from a caller that has already checked
// the super admin role (./actions.ts).
//
// It returns counts, times and configuration only, never what a farm's people
// wrote (log titles, notes, alert messages, recommendation text).

import {
  assessFarmHealth,
  summarizeRecommendations,
  type FarmHealth,
  type FarmSignals,
  type RecommendationSummary,
} from '@/utils/farm-health';
import type { KnowledgeDocument } from '@/utils/kb-coverage';
import { knowledgeGaps, type KnowledgeGap } from '@/utils/kb-requests';
import { POLICY_DEFAULTS } from '@/utils/farm-policy';
import { isPlaceholder } from '@/utils/plant-catalog';
import { HISTORY_DAYS, isExpired } from '@/utils/recommendation-lifecycle';

export interface FarmRef {
  id: string;
  name: string;
  gps_lat: number | null;
  gps_lng: number | null;
}

export interface BlockSetup {
  id: string;
  name: string;
  crop: string | null;
  variety: string | null;
  /** What is not set on the block, in plain words. Empty when it is complete. */
  missing: string[];
}

export interface SensorState {
  id: string;
  type: string;
  /** From the last reading's age against the farm's sensor-failure setting, not the stored status (nothing ever sets that to offline). */
  state: 'reporting' | 'silent' | 'never';
  lastSeenAt: string | null;
}

export interface FarmHealthReport {
  signals: FarmSignals;
  health: FarmHealth;
  blocks: BlockSetup[];
  sensors: SensorState[];
  /** Unresolved alerts counted by domain. */
  alertsByDomain: Record<string, number>;
  /** Recommendations created in the last HISTORY_DAYS days. */
  recommendations: RecommendationSummary;
  /** Null when the knowledge base could not be read. */
  knowledgeGaps: KnowledgeGap[] | null;
}

function latest(...values: (string | null | undefined)[]): string | null {
  const times = values.filter((v): v is string => Boolean(v)).sort();
  return times.length > 0 ? times[times.length - 1] : null;
}

export async function loadFarmHealth(
  admin: any,
  farm: FarmRef,
  docs: KnowledgeDocument[] | null,
  now: Date,
): Promise<FarmHealthReport> {
  const { data: blockRows } = await admin
    .from('blocks')
    .select('id, name, crop_type, variety, field_capacity, wilting_point, root_depth_m, planting_date')
    .eq('farm_id', farm.id)
    .order('name');
  const rows = (blockRows ?? []) as any[];
  const blockIds: string[] = rows.map((b) => b.id);
  const since = new Date(now.getTime() - HISTORY_DAYS * 24 * 3_600_000).toISOString();

  // A table that fails to read counts as "no data" for that signal, not as a crash of the whole page.
  const none = Promise.resolve({ data: [] as any[] });
  const [policy, weather, pheno, soil, snapshot, lastRec, recentRecs, pendingRecs, lastLog, lastActed, sensorRows, alertRows] = await Promise.all([
    admin.from('farm_policy').select('default_root_depth_m, sensor_failed_after_hours').eq('farm_id', farm.id).maybeSingle(),
    admin.from('weather_snapshots').select('created_at').eq('farm_id', farm.id).order('created_at', { ascending: false }).limit(1),
    blockIds.length ? admin.from('phenology_records').select('created_at').in('block_id', blockIds).eq('source', 'computed').order('created_at', { ascending: false }).limit(1) : none,
    blockIds.length ? admin.from('soil_water_readings').select('created_at').in('block_id', blockIds).eq('source', 'computed').order('created_at', { ascending: false }).limit(1) : none,
    admin.from('daily_snapshots').select('snapshot_date').eq('farm_id', farm.id).order('snapshot_date', { ascending: false }).limit(1),
    admin.from('recommendations').select('created_at').eq('farm_id', farm.id).order('created_at', { ascending: false }).limit(1),
    admin.from('recommendations').select('status, expires_at, manager_note, sources, reference_status').eq('farm_id', farm.id).gte('created_at', since),
    admin.from('recommendations').select('expires_at').eq('farm_id', farm.id).eq('status', 'pending'),
    admin.from('activity_log').select('created_at').eq('farm_id', farm.id).order('created_at', { ascending: false }).limit(1),
    admin.from('recommendations').select('acted_at').eq('farm_id', farm.id).not('acted_at', 'is', null).order('acted_at', { ascending: false }).limit(1),
    admin.from('sensors').select('id, sensor_type, last_seen_at').eq('farm_id', farm.id),
    blockIds.length ? admin.from('block_alerts').select('severity, domain').in('block_id', blockIds).eq('resolved', false) : none,
  ]);

  const defaultRootDepth = policy.data?.default_root_depth_m ?? null;
  const blocks: BlockSetup[] = rows.map((b) => {
    const missing: string[] = [];
    if (b.field_capacity == null) missing.push('field capacity');
    if (b.wilting_point == null) missing.push('wilting point');
    if (b.root_depth_m == null && defaultRootDepth == null) missing.push('root depth');
    if (isPlaceholder(b.variety)) missing.push('variety');
    if (!b.planting_date) missing.push('planting date');
    return { id: b.id, name: b.name, crop: b.crop_type ?? null, variety: b.variety ?? null, missing };
  });
  const missingAny = (...what: string[]) => blocks.filter((b) => b.missing.some((m) => what.includes(m))).length;

  const failedAfterMs = Number(policy.data?.sensor_failed_after_hours ?? POLICY_DEFAULTS.sensorFailedAfterHours) * 3_600_000;
  const sensors: SensorState[] = ((sensorRows.data ?? []) as any[]).map((s) => ({
    id: s.id,
    type: s.sensor_type,
    state: !s.last_seen_at ? 'never' : now.getTime() - new Date(s.last_seen_at).getTime() > failedAfterMs ? 'silent' : 'reporting',
    lastSeenAt: s.last_seen_at ?? null,
  }));

  const openAlerts = { critical: 0, warning: 0, info: 0 };
  const alertsByDomain: Record<string, number> = {};
  for (const a of (alertRows.data ?? []) as { severity: keyof typeof openAlerts; domain: string }[]) {
    if (a.severity in openAlerts) openAlerts[a.severity] += 1;
    alertsByDomain[a.domain] = (alertsByDomain[a.domain] ?? 0) + 1;
  }

  const gaps = docs
    ? knowledgeGaps(rows.map((b) => ({ farm_id: farm.id, crop_type: b.crop_type, variety: b.variety })), new Map([[farm.id, farm.name]]), docs, [])
    : null;

  // The snapshot is one row per block per day, rewritten on every run, so only its date is known.
  const snapshotDate: string | undefined = snapshot.data?.[0]?.snapshot_date;

  const signals: FarmSignals = {
    hasLocation: farm.gps_lat != null && farm.gps_lng != null,
    blocks: blocks.length,
    blocksMissingSoil: missingAny('field capacity', 'wilting point', 'root depth'),
    blocksMissingVariety: missingAny('variety'),
    blocksMissingPlantingDate: missingAny('planting date'),
    lastRun: {
      weather: weather.data?.[0]?.created_at ?? null,
      computeFields: latest(pheno.data?.[0]?.created_at, soil.data?.[0]?.created_at),
      dailySnapshot: snapshotDate ? `${snapshotDate}T00:00:00Z` : null,
      recommendations: lastRec.data?.[0]?.created_at ?? null,
    },
    sensors: {
      total: sensors.length,
      reporting: sensors.filter((s) => s.state === 'reporting').length,
      silent: sensors.filter((s) => s.state !== 'reporting').length,
    },
    openAlerts,
    pendingRecommendations: ((pendingRecs.data ?? []) as { expires_at: string | null }[]).filter((r) => !isExpired(r.expires_at, now)).length,
    lastActivity: latest(lastLog.data?.[0]?.created_at, lastActed.data?.[0]?.acted_at),
    knowledgeGaps: gaps?.length ?? 0,
  };

  const recommendations = summarizeRecommendations(((recentRecs.data ?? []) as any[]).map((r) => ({
    status: r.status,
    expired: r.status === 'pending' && isExpired(r.expires_at, now),
    // Only the reason code is read from the note; a free-text note is never selected for display.
    skipReason: typeof r.manager_note === 'string' && r.manager_note.startsWith('skip_reason:') ? r.manager_note.slice('skip_reason:'.length) : null,
    sourceBacked: Array.isArray(r.sources) && r.sources.length > 0,
    referenceStatus: r.reference_status ?? null,
  })));

  return { signals, health: assessFarmHealth(signals, now), blocks, sensors, alertsByDomain, recommendations, knowledgeGaps: gaps };
}
