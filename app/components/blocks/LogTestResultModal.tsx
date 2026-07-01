"use client";

import { useState, useEffect } from 'react';
import { X, Loader2, FlaskConical, Paperclip } from 'lucide-react';
import type { Block } from './types';
import { logTestResult, getFarmLabReadings, getLatestSoilReading } from '@/app/actions/soilTests';

interface Props {
  open: boolean;
  onClose: () => void;
  blocks: Block[];
  defaultBlockId?: string;
}

// ─── Benchmark engine ─────────────────────────────────────────────────────────

type BS = 'green' | 'amber' | 'red';
interface Benchmark { status: BS; label: string }

function getBenchmark(key: string, v: number): Benchmark {
  switch (key) {
    case 'ph':
      if (v < 6.0) return { status: 'amber', label: 'Very Acidic' };
      if (v < 6.5) return { status: 'amber', label: 'Slightly Acidic' };
      if (v <= 7.5) return { status: 'green', label: 'Optimal' };
      if (v <= 8.5) return { status: 'amber', label: 'Slightly Alkaline' };
      return { status: 'red', label: 'Very Alkaline' };
    case 'ec_soil':
      if (v < 1.0) return { status: 'green', label: 'Non-saline' };
      if (v < 1.5) return { status: 'amber', label: 'Low Salinity' };
      if (v < 4.0) return { status: 'amber', label: 'Moderate' };
      return { status: 'red', label: 'High Salinity' };
    case 'ec_water':
      if (v < 750)  return { status: 'green', label: 'Good' };
      if (v < 2000) return { status: 'amber', label: 'Moderate' };
      return { status: 'red', label: 'Poor' };
    case 'organic_matter':
      if (v < 1)  return { status: 'red',   label: 'Very Low' };
      if (v < 2)  return { status: 'amber', label: 'Low' };
      if (v < 4)  return { status: 'green', label: 'Medium' };
      if (v < 8)  return { status: 'green', label: 'High' };
      return { status: 'amber', label: 'Very High' };
    case 'phosphorus':
      if (v < 3)  return { status: 'red',   label: 'Very Low' };
      if (v < 6)  return { status: 'amber', label: 'Low' };
      if (v < 9)  return { status: 'green', label: 'Medium' };
      if (v < 12) return { status: 'green', label: 'High' };
      return { status: 'amber', label: 'Very High' };
    case 'potassium':
      if (v < 20)  return { status: 'red',   label: 'Very Low' };
      if (v < 40)  return { status: 'amber', label: 'Low' };
      if (v < 80)  return { status: 'green', label: 'Medium' };
      if (v < 160) return { status: 'green', label: 'High' };
      return { status: 'amber', label: 'Very High' };
    case 'lime':
      if (v < 1)  return { status: 'green', label: 'Non-calcareous' };
      if (v < 5)  return { status: 'green', label: 'Slightly Calcareous' };
      if (v < 15) return { status: 'amber', label: 'Calcareous' };
      if (v < 25) return { status: 'amber', label: 'Very Calcareous' };
      return { status: 'red', label: 'Extremely Calcareous' };
    case 'calcium':
      if (v < 1000) return { status: 'amber', label: 'Low' };
      if (v < 3000) return { status: 'green', label: 'Sufficient' };
      if (v < 6000) return { status: 'green', label: 'High' };
      return { status: 'amber', label: 'Very High' };
    case 'magnesium':
      if (v < 300)  return { status: 'red',   label: 'Low' };
      if (v < 1000) return { status: 'green', label: 'Sufficient' };
      if (v < 2000) return { status: 'amber', label: 'High' };
      return { status: 'red', label: 'Very High' };
    case 'iron':
      if (v < 5)  return { status: 'red',   label: 'Deficient' };
      if (v < 20) return { status: 'green', label: 'Sufficient' };
      return { status: 'amber', label: 'High' };
    case 'zinc':
      if (v < 0.5) return { status: 'red',   label: 'Deficient' };
      if (v < 1.0) return { status: 'amber', label: 'Marginal' };
      if (v < 3.0) return { status: 'green', label: 'Sufficient' };
      return { status: 'amber', label: 'High' };
    case 'copper':
      if (v < 0.5) return { status: 'red',   label: 'Deficient' };
      if (v < 2.0) return { status: 'green', label: 'Sufficient' };
      return { status: 'amber', label: 'High' };
    case 'manganese':
      if (v < 2)  return { status: 'red',   label: 'Deficient' };
      if (v < 15) return { status: 'green', label: 'Sufficient' };
      return { status: 'amber', label: 'High' };
    case 'cec':
      if (v < 5)  return { status: 'red',   label: 'Very Low' };
      if (v < 15) return { status: 'amber', label: 'Low' };
      if (v < 25) return { status: 'green', label: 'Medium' };
      if (v < 40) return { status: 'green', label: 'High' };
      return { status: 'amber', label: 'Very High' };
    case 'boron':
      if (v < 0.5) return { status: 'red',   label: 'Deficient' };
      if (v < 1.5) return { status: 'green', label: 'Sufficient' };
      return { status: 'amber', label: 'High' };
    default:
      return { status: 'green', label: '' };
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BenchmarkBadge({ status, label }: { status: BS; label: string }) {
  if (!label) return null;
  const cls: Record<BS, string> = {
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    red:   'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-tight ${cls[status]}`}>
      {label}
    </span>
  );
}

function ParamInput({
  label, value, onChange, unit, benchmarkKey,
}: {
  label: string; value: string; onChange: (v: string) => void; unit: string; benchmarkKey?: string;
}) {
  const num = parseFloat(value);
  const bench = benchmarkKey && !isNaN(num) ? getBenchmark(benchmarkKey, num) : null;
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between gap-1 min-h-[20px]">
        <label className="text-xs font-medium text-ink-2 leading-tight">{label}</label>
        {bench && <BenchmarkBadge status={bench.status} label={bench.label} />}
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        <input
          type="number"
          step="any"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="—"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder-line focus:outline-none focus:ring-2 focus:ring-green"
        />
        {unit && <span className="text-[10px] text-ink-4 shrink-0 whitespace-nowrap">{unit}</span>}
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="col-span-full">
      <p className="text-xs font-bold uppercase tracking-widest text-ink-4 border-b border-tile pb-1.5">
        {title}
      </p>
    </div>
  );
}

// ─── History card helpers ─────────────────────────────────────────────────────

type HistReading = Awaited<ReturnType<typeof getFarmLabReadings>>['data'] extends (infer T)[] | null ? T : never;

type HBS = 'green' | 'amber' | 'red';
function hbench(key: string, v: number): HBS {
  const t: Record<string, [number, HBS][]> = {
    ph_soil:        [[6,'amber'],[6.5,'amber'],[7.5,'green'],[8.5,'amber'],[Infinity,'red']],
    ec_soil:        [[1,'green'],[1.5,'amber'],[4,'amber'],[Infinity,'red']],
    organic_matter: [[1,'red'],[2,'amber'],[4,'green'],[8,'green'],[Infinity,'amber']],
    phosphorus:     [[3,'red'],[6,'amber'],[9,'green'],[12,'green'],[Infinity,'amber']],
    potassium:      [[20,'red'],[40,'amber'],[80,'green'],[160,'green'],[Infinity,'amber']],
    lime:           [[1,'green'],[5,'green'],[15,'amber'],[25,'amber'],[Infinity,'red']],
    cec:            [[5,'red'],[15,'amber'],[25,'green'],[40,'green'],[Infinity,'amber']],
    calcium:        [[1000,'amber'],[3000,'green'],[6000,'green'],[Infinity,'amber']],
    magnesium:      [[300,'red'],[1000,'green'],[2000,'amber'],[Infinity,'red']],
    iron:           [[5,'red'],[20,'green'],[Infinity,'amber']],
    zinc:           [[0.5,'red'],[1,'amber'],[3,'green'],[Infinity,'amber']],
    copper:         [[0.5,'red'],[2,'green'],[Infinity,'amber']],
    manganese:      [[2,'red'],[15,'green'],[Infinity,'amber']],
    boron:          [[0.5,'red'],[1.5,'green'],[Infinity,'amber']],
  };
  const thresholds = t[key];
  if (!thresholds) return 'green';
  for (const [max, s] of thresholds) if (v <= max) return s;
  return 'green';
}

function HChip({ label, value, unit, bk }: { label: string; value: number; unit: string; bk?: string }) {
  const s = bk ? hbench(bk, value) : null;
  const bg = s === 'green' ? 'bg-emerald-50 border-emerald-200'
           : s === 'amber' ? 'bg-amber-50 border-amber-200'
           : s === 'red'   ? 'bg-red-50 border-red-200'
           : 'bg-tile border-line';
  const dot = s === 'green' ? 'bg-emerald-500' : s === 'amber' ? 'bg-amber-500' : s === 'red' ? 'bg-red-500' : '';
  return (
    <div className={`flex flex-col gap-0.5 rounded-lg border px-2.5 py-1.5 ${bg}`}>
      <span className="text-[10px] font-medium text-ink-3 leading-tight">{label}</span>
      <div className="flex items-center gap-1">
        {s && <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${dot}`} />}
        <span className="text-xs font-bold text-ink">{value}</span>
        <span className="text-[10px] text-ink-4">{unit}</span>
      </div>
    </div>
  );
}

const HIST_CHIPS: { key: string; label: string; unit: string; bk?: string }[] = [
  { key: 'organic_matter',  label: 'Organic Matter', unit: '%',        bk: 'organic_matter' },
  { key: 'phosphorus_p2o5', label: 'P₂O₅',          unit: 'kg/da',    bk: 'phosphorus' },
  { key: 'potassium_k2o',   label: 'K₂O',           unit: 'kg/da',    bk: 'potassium' },
  { key: 'lime',            label: 'Lime',           unit: '%',        bk: 'lime' },
  { key: 'cec',             label: 'CEC',            unit: 'meq/100g', bk: 'cec' },
  { key: 'calcium',         label: 'Calcium',        unit: 'ppm',      bk: 'calcium' },
  { key: 'magnesium',       label: 'Magnesium',      unit: 'ppm',      bk: 'magnesium' },
  { key: 'sodium',          label: 'Sodium',         unit: 'ppm' },
  { key: 'iron',            label: 'Iron',           unit: 'ppm',      bk: 'iron' },
  { key: 'zinc',            label: 'Zinc',           unit: 'ppm',      bk: 'zinc' },
  { key: 'copper',          label: 'Copper',         unit: 'ppm',      bk: 'copper' },
  { key: 'manganese',       label: 'Manganese',      unit: 'ppm',      bk: 'manganese' },
  { key: 'boron',           label: 'Boron',          unit: 'mg/kg',    bk: 'boron' },
];

function HistReadingCard({ r }: { r: HistReading }) {
  const isWater = r.test_type === 'water';
  const p = (r.parameters ?? {}) as Record<string, unknown>;
  const hdr = isWater
    ? 'bg-sky-50 border-sky-100'
    : 'bg-tile border-tile';
  return (
    <div className="border-b border-tile last:border-0 pb-4 mb-4 last:pb-0 last:mb-0 flex flex-col gap-2">
      <div className={`flex items-center justify-between rounded-lg px-3 py-2 border ${hdr}`}>
        <div>
          <span className="text-xs font-bold text-ink-2">
            {new Date(r.recorded_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          {r.lab_reference && <span className="ml-2 text-xs text-ink-4">· {r.lab_reference}</span>}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${isWater ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {isWater ? 'Water' : 'Soil'}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 px-1">
        {r.ph != null && <HChip label="pH" value={r.ph} unit="" bk={isWater ? 'ph_water' : 'ph_soil'} />}
        {r.soil_ec != null && <HChip label="EC" value={isWater ? Math.round(r.soil_ec * 1000) : r.soil_ec} unit={isWater ? 'µs/cm' : 'ms/cm'} bk="ec_soil" />}
        {r.soil_moisture != null && <HChip label="Moisture" value={r.soil_moisture} unit="%" />}
      </div>
      {!isWater && HIST_CHIPS.some(c => p[c.key] != null) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 px-1">
          {HIST_CHIPS.map(c => {
            const v = p[c.key];
            if (v == null || typeof v !== 'number') return null;
            return <HChip key={c.key} label={c.label} value={v} unit={c.unit} bk={c.bk} />;
          })}
          {typeof p.texture_class === 'string' && p.texture_class && (
            <div className="col-span-2 flex flex-col gap-0.5 rounded-lg border border-line bg-tile px-2.5 py-1.5">
              <span className="text-[10px] font-medium text-ink-3">Texture</span>
              <span className="text-xs font-bold text-ink">{p.texture_class}</span>
            </div>
          )}
        </div>
      )}
      {r.notes && <p className="px-1 text-xs text-ink-3 italic">{r.notes}</p>}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

const EMPTY_SOIL = {
  organicMatter: '', phosphorus: '', potassium: '', lime: '',
  calcium: '', magnesium: '', sodium: '',
  iron: '', zinc: '', copper: '', manganese: '', boron: '', cec: '',
  sand: '', clay: '', silt: '', textureClass: '',
};

export default function LogTestResultModal({ open, onClose, blocks, defaultBlockId }: Props) {
  const [blockId,      setBlockId]      = useState(defaultBlockId ?? '');
  const [recordedAt,   setRecordedAt]   = useState('');
  const [labReference, setLabReference] = useState('');
  const [ph,           setPh]           = useState('');
  const [soilEc,       setSoilEc]       = useState('');   // ms/cm
  const [waterEc,      setWaterEc]      = useState('');   // µs/cm
  const [soilMoisture, setSoilMoisture] = useState('');
  const [rootZoneTemp, setRootZoneTemp] = useState('');
  const [waterDeficit, setWaterDeficit] = useState('');
  const [soil,         setSoil]         = useState({ ...EMPTY_SOIL });
  const [notes,        setNotes]        = useState('');
  const [file,         setFile]         = useState<File | null>(null);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [extracting,    setExtracting]    = useState(false);
  const [extractedCount, setExtractedCount] = useState<number | null>(null);
  const [extractMsg,    setExtractMsg]    = useState<string | null>(null);
  const [view,          setView]          = useState<'form' | 'history'>('form');
  const [histReadings,  setHistReadings]  = useState<HistReading[]>([]);
  const [histLoading,   setHistLoading]   = useState(false);

  const [existingId,   setExistingId]   = useState<string | null>(null);
  const [existingFileUrl, setExistingFileUrl] = useState<string | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(false);

  const setSoilField = (key: keyof typeof EMPTY_SOIL) => (v: string) =>
    setSoil(s => ({ ...s, [key]: v }));

  useEffect(() => {
    if (open) {
      setBlockId(defaultBlockId ?? '');
      setFile(null);
      setError(null);
      setExtractedCount(null);
      setExtractMsg(null);
      setView('form');
    }
  }, [open, defaultBlockId]);

  useEffect(() => {
    if (!open) return;

    async function loadLatestReading() {
      setLoadingLatest(true);
      setError(null);
      try {
        const targetId = blockId === '__farm__' ? null : blockId;
        const res = await getLatestSoilReading(targetId);
        if (res.error) {
          setError(res.error);
          return;
        }

        if (res.data) {
          const r = res.data;
          setExistingId(r.id);
          setRecordedAt(r.recorded_at ? new Date(r.recorded_at).toISOString().split('T')[0] : '');
          setLabReference(r.lab_reference ?? '');
          setPh(r.ph != null ? String(r.ph) : '');
          setSoilEc(r.soil_ec != null ? String(r.soil_ec) : '');
          
          const p = (r.parameters ?? {}) as Record<string, any>;
          setWaterEc(p.water_ec_us_cm != null ? String(p.water_ec_us_cm) : '');
          setSoilMoisture(r.soil_moisture != null ? String(r.soil_moisture) : '');
          setRootZoneTemp(r.root_zone_temp != null ? String(r.root_zone_temp) : '');
          setWaterDeficit(r.water_deficit != null ? String(r.water_deficit) : '');
          setNotes(r.notes ?? '');
          setExistingFileUrl(r.file_url ?? null);

          // Populate extended soil params
          const newSoil = { ...EMPTY_SOIL };
          const keys: (keyof typeof EMPTY_SOIL)[] = [
            'organicMatter', 'phosphorus', 'potassium', 'lime',
            'calcium', 'magnesium', 'sodium',
            'iron', 'zinc', 'copper', 'manganese', 'boron', 'cec',
            'sand', 'clay', 'silt', 'textureClass'
          ];
          const dbMapping: Record<string, string> = {
            organicMatter: 'organic_matter',
            phosphorus: 'phosphorus_p2o5',
            potassium: 'potassium_k2o',
            lime: 'lime',
            calcium: 'calcium',
            magnesium: 'magnesium',
            sodium: 'sodium',
            iron: 'iron',
            zinc: 'zinc',
            copper: 'copper',
            manganese: 'manganese',
            boron: 'boron',
            cec: 'cec',
            sand: 'sand',
            clay: 'clay',
            silt: 'silt',
            textureClass: 'texture_class'
          };
          for (const key of keys) {
            const dbKey = dbMapping[key];
            if (p[dbKey] != null) {
              newSoil[key] = String(p[dbKey]);
            }
          }
          setSoil(newSoil);
        } else {
          // Reset to empty for this block/scope since no reading exists
          setExistingId(null);
          setRecordedAt('');
          setLabReference('');
          setPh('');
          setSoilEc('');
          setWaterEc('');
          setSoilMoisture('');
          setRootZoneTemp('');
          setWaterDeficit('');
          setSoil({ ...EMPTY_SOIL });
          setNotes('');
          setExistingFileUrl(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load latest test result');
      } finally {
        setLoadingLatest(false);
      }
    }

    loadLatestReading();
  }, [open, blockId]);

  function switchToHistory() {
    setView('history');
    setHistLoading(true);
    getFarmLabReadings().then(r => {
      setHistReadings(r.data ?? []);
      setHistLoading(false);
    });
  }

  async function handleFileSelect(selected: File | null) {
    setFile(selected);
    setExtractedCount(null);
    setExtractMsg(null);
    if (!selected) return;

    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append('file', selected);
      const res = await fetch('/api/extract-soil-test', { method: 'POST', body: fd });
      if (!res.ok) return;
      const { extracted, message } = await res.json();
      if (message) { setExtractMsg(message); return; }
      if (!extracted) return;

      let count = 0;
      const str = (v: unknown) => (v != null ? String(v) : '');

      if (extracted.labReference)  { setLabReference(extracted.labReference); count++; }
      if (extracted.recordedAt)    { setRecordedAt(extracted.recordedAt);     count++; }
      if (extracted.ph != null)    { setPh(str(extracted.ph));                count++; }
      if (extracted.soilEc != null){ setSoilEc(str(extracted.soilEc));        count++; }
      if (extracted.waterEc != null){ setWaterEc(str(extracted.waterEc));     count++; }

      const soilMap: Array<[string, keyof typeof EMPTY_SOIL]> = [
        ['organicMatter', 'organicMatter'], ['phosphorus', 'phosphorus'],
        ['potassium', 'potassium'],         ['lime', 'lime'],
        ['cec', 'cec'],                     ['calcium', 'calcium'],
        ['magnesium', 'magnesium'],         ['sodium', 'sodium'],
        ['iron', 'iron'],                   ['zinc', 'zinc'],
        ['copper', 'copper'],               ['manganese', 'manganese'],
        ['boron', 'boron'],                 ['sand', 'sand'],
        ['clay', 'clay'],                   ['silt', 'silt'],
        ['textureClass', 'textureClass'],
      ];
      const updates: Partial<typeof EMPTY_SOIL> = {};
      for (const [key, field] of soilMap) {
        if (extracted[key] != null) { updates[field] = str(extracted[key]); count++; }
      }
      if (Object.keys(updates).length > 0) setSoil(s => ({ ...s, ...updates }));

      setExtractedCount(count);
    } catch {
      // silent — user fills manually
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave() {
    setError(null);
    setSaving(true);

    try {
      const fd = new FormData();
      if (existingId) {
        fd.append('id', existingId);
      }
      fd.append('blockId',      blockId === '__farm__' ? '' : blockId);
      fd.append('testType',     'soil');
      fd.append('recordedAt',   recordedAt);
      fd.append('labReference', labReference);
      fd.append('ph',           ph);
      fd.append('soilEc',       soilEc);
      fd.append('waterEc',      waterEc);
      fd.append('soilMoisture', soilMoisture);
      fd.append('rootZoneTemp', rootZoneTemp);
      fd.append('waterDeficit', waterDeficit);
      fd.append('notes',        notes);

      if (file) {
        fd.append('file', file);
      } else if (existingFileUrl) {
        fd.append('fileUrl', existingFileUrl);
      }

      for (const [k, v] of Object.entries(soil)) fd.append(k, v);

      const result = await logTestResult(fd);
      setSaving(false);
      if (result.error) { setError(result.error); return; }
      onClose();
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? e.message : 'Save failed — check server logs');
    }
  }

  if (!open) return null;

  const inputCls = 'rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder-ink-4 focus:outline-none focus:ring-2 focus:ring-green w-full';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-surface shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <FlaskConical className="h-5 w-5 text-green shrink-0" />
            <div>
              <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
                Lab Test Results
                {view === 'form' && existingId && (
                  <span className="rounded bg-green-soft text-green px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider animate-pulse">
                    Updating Saved
                  </span>
                )}
              </h2>
              <div className="flex gap-1 mt-1.5">
                <button
                  onClick={() => setView('form')}
                  className={`rounded-full px-3 py-0.5 text-xs font-medium transition-colors ${view === 'form' ? 'bg-green text-white' : 'bg-tile text-ink-3 hover:bg-line'}`}
                >
                  Log New
                </button>
                <button
                  onClick={switchToHistory}
                  className={`rounded-full px-3 py-0.5 text-xs font-medium transition-colors ${view === 'history' ? 'bg-green text-white' : 'bg-tile text-ink-3 hover:bg-line'}`}
                >
                  History
                </button>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-4 hover:bg-tile hover:text-ink-2 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* History body */}
        {view === 'history' && (
          <div className="overflow-y-auto px-6 py-4 flex-1">
            {histLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-ink-4">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
              </div>
            ) : histReadings.length === 0 ? (
              <div className="py-12 text-center text-sm text-ink-4">
                No lab results saved yet. Switch to &ldquo;Log New&rdquo; to add one.
              </div>
            ) : (
              <div className="py-1">
                {histReadings.map(r => <HistReadingCard key={r.id} r={r} />)}
              </div>
            )}
          </div>
        )}

        {/* Form body */}
        {view === 'form' && (
          loadingLatest ? (
            <div className="flex-1 flex flex-col items-center justify-center py-24 text-ink-4 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-green" />
              <span className="text-sm font-medium">Loading latest soil test readings…</span>
            </div>
          ) : (
            <div className="overflow-y-auto px-6 py-4 flex flex-col gap-5">

              {/* Sample info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <SectionHeader title="Sample Information" />
                <div className="col-span-3 flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-ink-2">Block / Scope</label>
                  <select value={blockId} onChange={e => setBlockId(e.target.value)} className={inputCls}>
                    <option value="__farm__">🌾 Whole Farm (no specific block)</option>
                    {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-ink-2">Test Date</label>
                  <input type="date" value={recordedAt} onChange={e => setRecordedAt(e.target.value)} className={inputCls} />
                </div>
                <div className="col-span-2 flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-ink-2">Lab Reference</label>
                  <input type="text" placeholder="e.g. SA250023" value={labReference} onChange={e => setLabReference(e.target.value)} className={inputCls} />
                </div>
              </div>

              {/* Basic properties — soil pH/EC + water EC in one section */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <SectionHeader title="Basic Properties" />
                <ParamInput label="pH" value={ph} onChange={setPh} unit="" benchmarkKey="ph" />
                <ParamInput label="Soil EC" value={soilEc} onChange={setSoilEc} unit="ms/cm" benchmarkKey="ec_soil" />
                <ParamInput label="Water EC" value={waterEc} onChange={setWaterEc} unit="µs/cm" benchmarkKey="ec_water" />
              </div>

              {/* Macronutrients & chemistry */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <SectionHeader title="Macronutrients & Chemistry" />
                <ParamInput label="Organic Matter" value={soil.organicMatter} onChange={setSoilField('organicMatter')} unit="%" benchmarkKey="organic_matter" />
                <ParamInput label="Phosphorus (P₂O₅)" value={soil.phosphorus} onChange={setSoilField('phosphorus')} unit="kg/da" benchmarkKey="phosphorus" />
                <ParamInput label="Potassium (K₂O)" value={soil.potassium} onChange={setSoilField('potassium')} unit="kg/da" benchmarkKey="potassium" />
                <ParamInput label="Lime (CaCO₃)" value={soil.lime} onChange={setSoilField('lime')} unit="%" benchmarkKey="lime" />
                <ParamInput label="CEC" value={soil.cec} onChange={setSoilField('cec')} unit="meq/100g" benchmarkKey="cec" />
              </div>

              {/* Minerals */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SectionHeader title="Minerals" />
                <ParamInput label="Calcium" value={soil.calcium} onChange={setSoilField('calcium')} unit="ppm" benchmarkKey="calcium" />
                <ParamInput label="Magnesium" value={soil.magnesium} onChange={setSoilField('magnesium')} unit="ppm" benchmarkKey="magnesium" />
                <ParamInput label="Sodium" value={soil.sodium} onChange={setSoilField('sodium')} unit="ppm" />
                <ParamInput label="Iron" value={soil.iron} onChange={setSoilField('iron')} unit="ppm" benchmarkKey="iron" />
                <ParamInput label="Zinc" value={soil.zinc} onChange={setSoilField('zinc')} unit="ppm" benchmarkKey="zinc" />
                <ParamInput label="Copper" value={soil.copper} onChange={setSoilField('copper')} unit="ppm" benchmarkKey="copper" />
                <ParamInput label="Manganese" value={soil.manganese} onChange={setSoilField('manganese')} unit="ppm" benchmarkKey="manganese" />
                <ParamInput label="Boron" value={soil.boron} onChange={setSoilField('boron')} unit="mg/kg" benchmarkKey="boron" />
              </div>

              {/* Soil texture */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SectionHeader title="Soil Texture" />
                <ParamInput label="Sand" value={soil.sand} onChange={setSoilField('sand')} unit="%" />
                <ParamInput label="Clay" value={soil.clay} onChange={setSoilField('clay')} unit="%" />
                <ParamInput label="Silt" value={soil.silt} onChange={setSoilField('silt')} unit="%" />
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-ink-2">Texture Class</label>
                  <select
                    value={soil.textureClass}
                    onChange={e => setSoilField('textureClass')(e.target.value)}
                    className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-green"
                  >
                    <option value="">— Select —</option>
                    <option value="Loam">Loam</option>
                    <option value="Clay">Clay</option>
                    <option value="Sandy">Sandy</option>
                    <option value="Silty">Silty</option>
                    <option value="Peaty">Peaty</option>
                    <option value="Chalky">Chalky</option>
                  </select>
                </div>
              </div>

              {/* Optional sensor readings */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <SectionHeader title="Optional Sensor Readings" />
                <ParamInput label="Soil Moisture" value={soilMoisture} onChange={setSoilMoisture} unit="% vol" />
                <ParamInput label="Root Zone Temp" value={rootZoneTemp} onChange={setRootZoneTemp} unit="°C" />
                <ParamInput label="Water Deficit" value={waterDeficit} onChange={setWaterDeficit} unit="mm" />
              </div>

              {/* Notes & file */}
              <div className="grid grid-cols-1 gap-3">
                <SectionHeader title="Notes & Attachment" />
                <textarea
                  rows={3}
                  placeholder="Observations, context, or lab comments…"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className={`${inputCls} resize-none`}
                />
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line px-4 py-3 text-sm text-ink-3 hover:border-green hover:text-green transition-colors">
                  {extracting
                    ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-green" />
                    : <Paperclip className="h-4 w-4 shrink-0" />}
                  <span className="truncate">
                    {extracting
                      ? 'Reading document and extracting values…'
                      : file ? file.name : existingFileUrl ? `Attached report: ${existingFileUrl.split('/').pop()} (Click to change)` : 'Attach lab report (PDF or image) — values will be extracted automatically'}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    className="sr-only"
                    onChange={e => handleFileSelect(e.target.files?.[0] ?? null)}
                  />
                </label>
                {existingFileUrl && !file && (
                  <div className="flex items-center gap-1.5 text-xs text-green">
                    <Paperclip className="h-3 w-3" />
                    <span>An analysis report is currently saved for this test. Uploading a new one will replace it.</span>
                  </div>
                )}
                {extractMsg && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                    {extractMsg}
                  </div>
                )}
                {extractedCount !== null && (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                    {extractedCount > 0
                      ? `${extractedCount} field${extractedCount === 1 ? '' : 's'} auto-filled from document — review and adjust as needed.`
                      : 'Could not extract values from this document — please fill in manually.'}
                  </div>
                )}
              </div>

            </div>
          )
        )}

        {/* Error (form only) */}
        {view === 'form' && error && (
          <div className="mx-6 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4 shrink-0">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-2 hover:bg-tile transition-colors">
            {view === 'history' ? 'Close' : 'Cancel'}
          </button>
          {view === 'form' && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-green px-4 py-2 text-sm font-medium text-white hover:bg-green transition-colors disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Test Result
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
