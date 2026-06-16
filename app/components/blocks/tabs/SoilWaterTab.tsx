"use client";

import { useState, useEffect } from 'react';
import { Paperclip, Wifi } from 'lucide-react';
import type { SoilWaterDomain } from '../types';
import AlertBadge from '../AlertBadge';
import SourceBadge from '../SourceBadge';

interface Props {
  data: SoilWaterDomain;
  blockId: string;
  sensorCount?: number;
  refreshKey?: number;
}

interface SoilParams {
  organic_matter?:  number;
  phosphorus_p2o5?: number;
  potassium_k2o?:   number;
  lime?:            number;
  cec?:             number;
  calcium?:         number;
  magnesium?:       number;
  sodium?:          number;
  iron?:            number;
  zinc?:            number;
  copper?:          number;
  manganese?:       number;
  boron?:           number;
  sand?:            number;
  clay?:            number;
  silt?:            number;
  texture_class?:   string;
  water_ec_us_cm?:  number;
}

interface ManualReading {
  id:             string;
  recorded_at:    string;
  test_type:      string | null;
  ph:             number | null;
  soil_ec:        number | null;
  soil_moisture:  number | null;
  root_zone_temp: number | null;
  water_deficit:  number | null;
  lab_reference:  string | null;
  file_url:       string | null;
  notes:          string | null;
  parameters:     SoilParams | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Benchmark helpers ────────────────────────────────────────────────────────

type BS = 'green' | 'amber' | 'red';
function bench(key: string, v: number): BS {
  const t: Record<string, [number, BS][]> = {
    ph_soil:        [[6,  'amber'], [6.5, 'amber'], [7.5, 'green'], [8.5, 'amber'], [Infinity, 'red']],
    ph_water:       [[6.5,'amber'], [8.5, 'green'], [Infinity, 'amber']],
    ec_soil:        [[1,  'green'], [1.5, 'amber'], [4,   'amber'], [Infinity, 'red']],
    organic_matter: [[1,  'red'],   [2,   'amber'], [4,   'green'], [8, 'green'], [Infinity, 'amber']],
    phosphorus:     [[3,  'red'],   [6,   'amber'], [9,   'green'], [12,'green'], [Infinity, 'amber']],
    potassium:      [[20, 'red'],   [40,  'amber'], [80,  'green'], [160,'green'],[Infinity, 'amber']],
    lime:           [[1,  'green'], [5,   'green'], [15,  'amber'], [25,'amber'], [Infinity, 'red']],
    cec:            [[5,  'red'],   [15,  'amber'], [25,  'green'], [40,'green'], [Infinity, 'amber']],
    calcium:        [[1000,'amber'],[3000,'green'], [6000,'green'], [Infinity,'amber']],
    magnesium:      [[300,'red'],   [1000,'green'], [2000,'amber'], [Infinity,'red']],
    iron:           [[5,  'red'],   [20,  'green'], [Infinity,'amber']],
    zinc:           [[0.5,'red'],   [1,   'amber'], [3,   'green'], [Infinity,'amber']],
    copper:         [[0.5,'red'],   [2,   'green'], [Infinity,'amber']],
    manganese:      [[2,  'red'],   [15,  'green'], [Infinity,'amber']],
    boron:          [[0.5,'red'],   [1.5, 'green'], [Infinity,'amber']],
  };
  const thresholds = t[key];
  if (!thresholds) return 'green';
  for (const [max, status] of thresholds) if (v <= max) return status;
  return 'green';
}

function StatusDot({ k, v }: { k: string; v: number }) {
  const s = bench(k, v);
  const cls = s === 'green' ? 'bg-emerald-500' : s === 'amber' ? 'bg-amber-500' : 'bg-red-500';
  return <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${cls}`} />;
}

// ─── MoistureBar ─────────────────────────────────────────────────────────────

function MoistureBar({ value, field, wilting }: { value: number; field: number; wilting: number }) {
  const pct = Math.min(100, (value / field) * 100);
  const wiltPct = (wilting / field) * 100;
  const color = value < wilting ? 'bg-red-500' : value < wilting + 5 ? 'bg-amber-400' : 'bg-brand-500';
  return (
    <div className="mt-1 flex flex-col gap-1">
      <div className="relative h-4 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
        <div className="absolute top-0 h-full w-0.5 bg-red-400 opacity-70" style={{ left: `${wiltPct}%` }} title="Wilting point" />
      </div>
      <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500">
        <span>0%</span>
        <span className="text-red-400">Wilting {wilting}%</span>
        <span>Field cap. {field}%</span>
      </div>
    </div>
  );
}

function MetricRow({ label, value, unit, source }: { label: string; value: string | number; unit?: string; source?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-900 dark:text-white">
          {value}{unit && <span className="font-normal text-slate-400 ml-0.5">{unit}</span>}
        </span>
        {source && <span className="rounded-full px-1.5 py-0.5 text-xs bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 capitalize">{source}</span>}
      </div>
    </div>
  );
}

// ─── File link ────────────────────────────────────────────────────────────────

function FileLink({ path }: { path: string }) {
  const [url, setUrl]   = useState<string | null>(null);
  const [loading, setL] = useState(false);
  async function handleClick() {
    setL(true);
    const { createClient } = await import('@/utils/supabase/client');
    const sb = createClient();
    const { data } = await sb.storage.from('lab-reports').createSignedUrl(path, 3600);
    setUrl(data?.signedUrl ?? null);
    setL(false);
  }
  if (url) return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline dark:text-brand-400">
      <Paperclip className="h-3 w-3" /> View lab report
    </a>
  );
  return (
    <button onClick={handleClick} disabled={loading} className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline dark:text-brand-400 disabled:opacity-60">
      <Paperclip className="h-3 w-3" />{loading ? 'Loading…' : 'View lab report'}
    </button>
  );
}

// ─── Parameter chip ───────────────────────────────────────────────────────────

function ParamChip({ label, value, unit, benchKey }: { label: string; value: number; unit: string; benchKey?: string }) {
  const s = benchKey ? bench(benchKey, value) : null;
  const bg = s === 'green' ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/40'
           : s === 'amber' ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/40'
           : s === 'red'   ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800/40'
           : 'bg-slate-50 border-slate-200 dark:bg-slate-800/40 dark:border-slate-700';
  return (
    <div className={`flex flex-col gap-0.5 rounded-lg border px-2.5 py-1.5 ${bg}`}>
      <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 leading-tight">{label}</span>
      <div className="flex items-center gap-1">
        {s && <StatusDot k={benchKey!} v={value} />}
        <span className="text-xs font-bold text-slate-900 dark:text-white">{value}</span>
        <span className="text-[10px] text-slate-400">{unit}</span>
      </div>
    </div>
  );
}

// ─── Reading card ─────────────────────────────────────────────────────────────

const SOIL_CHIPS: { key: keyof SoilParams; label: string; unit: string; benchKey?: string }[] = [
  { key: 'organic_matter',  label: 'Organic Matter',  unit: '%',       benchKey: 'organic_matter' },
  { key: 'phosphorus_p2o5', label: 'P₂O₅',           unit: 'kg/da',   benchKey: 'phosphorus' },
  { key: 'potassium_k2o',   label: 'K₂O',            unit: 'kg/da',   benchKey: 'potassium' },
  { key: 'lime',            label: 'Lime',            unit: '%',       benchKey: 'lime' },
  { key: 'cec',             label: 'CEC',             unit: 'meq/100g',benchKey: 'cec' },
  { key: 'calcium',         label: 'Calcium',         unit: 'ppm',     benchKey: 'calcium' },
  { key: 'magnesium',       label: 'Magnesium',       unit: 'ppm',     benchKey: 'magnesium' },
  { key: 'sodium',          label: 'Sodium',          unit: 'ppm' },
  { key: 'iron',            label: 'Iron',            unit: 'ppm',     benchKey: 'iron' },
  { key: 'zinc',            label: 'Zinc',            unit: 'ppm',     benchKey: 'zinc' },
  { key: 'copper',          label: 'Copper',          unit: 'ppm',     benchKey: 'copper' },
  { key: 'manganese',       label: 'Manganese',       unit: 'ppm',     benchKey: 'manganese' },
  { key: 'boron',           label: 'Boron',           unit: 'mg/kg',   benchKey: 'boron' },
];

function ReadingCard({ r }: { r: ManualReading }) {
  const isWater = r.test_type === 'water';
  const p = r.parameters ?? {};
  const headerColor = isWater
    ? 'bg-sky-50 dark:bg-sky-950/20 border-sky-100 dark:border-sky-800/30'
    : 'bg-slate-50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-800';

  return (
    <div className="border-b border-slate-100 dark:border-slate-800 last:border-0 pb-3 mb-3 last:pb-0 last:mb-0 flex flex-col gap-2">
      {/* Row 1: date + badges */}
      <div className={`flex items-center justify-between rounded-lg px-3 py-2 border ${headerColor}`}>
        <div>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
            {new Date(r.recorded_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          {r.lab_reference && (
            <span className="ml-2 text-xs text-slate-400">· {r.lab_reference}</span>
          )}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${isWater ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>
          {isWater ? 'Water' : 'Soil'}
        </span>
      </div>

      {/* Row 2: core metrics */}
      <div className="flex flex-wrap gap-1.5 px-1">
        {r.ph != null && (
          <ParamChip label="pH" value={r.ph} unit="" benchKey={isWater ? 'ph_water' : 'ph_soil'} />
        )}
        {r.soil_ec != null && (
          <ParamChip
            label={isWater ? 'EC' : 'EC'}
            value={isWater ? Math.round(r.soil_ec * 1000) : r.soil_ec}
            unit={isWater ? 'µs/cm' : 'ms/cm'}
            benchKey={isWater ? 'ec_water_approx' : 'ec_soil'}
          />
        )}
        {r.soil_moisture != null && <ParamChip label="Moisture" value={r.soil_moisture} unit="%" />}
      </div>

      {/* Row 3: extended soil params grid */}
      {!isWater && SOIL_CHIPS.some(c => p[c.key] != null) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 px-1">
          {SOIL_CHIPS.map(c => {
            const v = p[c.key];
            if (v == null || typeof v !== 'number') return null;
            return <ParamChip key={c.key} label={c.label} value={v} unit={c.unit} benchKey={c.benchKey} />;
          })}
          {p.texture_class && (
            <div className="col-span-2 flex flex-col gap-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-2.5 py-1.5">
              <span className="text-[10px] font-medium text-slate-500">Texture</span>
              <span className="text-xs font-bold text-slate-900 dark:text-white">{p.texture_class as string}</span>
            </div>
          )}
        </div>
      )}

      {/* Row 4: notes + file */}
      {(r.notes || r.file_url) && (
        <div className="flex items-center justify-between gap-2 px-1">
          {r.notes && <p className="text-xs text-slate-500 italic flex-1">{r.notes}</p>}
          {r.file_url && <FileLink path={r.file_url} />}
        </div>
      )}
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export default function SoilWaterTab({ data, blockId, sensorCount = 0, refreshKey }: Props) {
  const [history, setHistory]               = useState<ManualReading[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!blockId) return;
    setHistoryLoading(true);
    import('@/utils/supabase/client').then(async ({ createClient }) => {
      const sb = createClient();
      const { data: rows } = await sb
        .from('soil_water_readings')
        .select('id, recorded_at, test_type, ph, soil_ec, soil_moisture, root_zone_temp, water_deficit, lab_reference, file_url, notes, parameters')
        .or(`block_id.eq.${blockId},block_id.is.null`)
        .eq('source', 'manual')
        .order('recorded_at', { ascending: false })
        .limit(20);
      setHistory((rows ?? []) as ManualReading[]);
      setHistoryLoading(false);
    });
  }, [blockId, refreshKey]);

  const moistureStatus =
    data.soilMoisture < data.wiltingPoint ? 'text-red-600' :
    data.soilMoisture < data.wiltingPoint + 5 ? 'text-amber-600' :
    'text-brand-600';

  return (
    <div className="flex flex-col gap-6">
      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="flex flex-col gap-2">
          {data.alerts.map(a => (
            <AlertBadge key={a.id} severity={a.severity} message={a.message} source={a.source} timestamp={a.timestamp} />
          ))}
        </div>
      )}

      {/* Soil moisture hero */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Soil Moisture</h3>
          <SourceBadge source={data.source} />
        </div>
        {sensorCount > 0 ? (
          <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 mb-3">
            <Wifi className="h-3 w-3" />
            {sensorCount} sensor{sensorCount > 1 ? 's' : ''} monitoring
            {data.lastReadingAt && ` · updated ${formatRelativeTime(data.lastReadingAt)}`}
          </p>
        ) : (
          <div className="mb-3" />
        )}
        <div className="flex items-end gap-2">
          <span className={`text-4xl font-bold ${moistureStatus}`}>{data.soilMoisture}</span>
          <span className="text-lg text-slate-400 pb-1">% vol</span>
        </div>
        <MoistureBar value={data.soilMoisture} field={data.fieldCapacity} wilting={data.wiltingPoint} />
      </div>

      {/* Sensor metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 mb-1">Soil EC</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{data.soilEC} <span className="text-sm font-normal text-slate-400">dS/m</span></p>
          <p className="text-xs text-slate-400 mt-1">Normal range: 0.8–2.0</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 mb-1">Root Zone Temp</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{data.rootZoneTemp} <span className="text-sm font-normal text-slate-400">°C</span></p>
          <p className="text-xs text-slate-400 mt-1">Sensor</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 mb-1">ETo (daily)</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{data.eto} <span className="text-sm font-normal text-slate-400">mm/day</span></p>
          <p className="text-xs text-teal-500 mt-1">Computed</p>
        </div>
        <div className={`rounded-xl border p-4 ${data.waterDeficit > 40 ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'}`}>
          <p className="text-xs text-slate-500 mb-1">Water Deficit</p>
          <p className={`text-2xl font-bold ${data.waterDeficit > 40 ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}>
            {data.waterDeficit} <span className="text-sm font-normal text-slate-400">mm</span>
          </p>
          <p className="text-xs text-teal-500 mt-1">Computed</p>
        </div>
      </div>

      {/* Irrigation schedule */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Irrigation Schedule</h3>
        </div>
        <div className="px-4 divide-y divide-slate-100 dark:divide-slate-800">
          <MetricRow label="Last Irrigation" value={data.lastIrrigation.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} source="manual" />
          <MetricRow label="Next Irrigation Due" value={data.nextIrrigationDue.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} source="calendar" />
        </div>
      </div>

      {/* Lab Test History */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Lab Test History</h3>
          <span className="text-xs text-slate-400">
            {historyLoading ? '…' : `${history.length} reading${history.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        {historyLoading ? (
          <div className="px-4 py-6 text-center text-sm text-slate-400">Loading…</div>
        ) : history.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-400">
            No lab readings yet. Use &ldquo;Log Test Result&rdquo; to add one.
          </div>
        ) : (
          <div className="px-4 py-3">
            {history.map(r => <ReadingCard key={r.id} r={r} />)}
          </div>
        )}
      </div>
    </div>
  );
}
