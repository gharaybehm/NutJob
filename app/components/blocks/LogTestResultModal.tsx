"use client";

import { useState, useEffect } from 'react';
import { X, Loader2, FlaskConical, Paperclip } from 'lucide-react';
import type { Block } from './types';
import { logTestResult } from '@/app/actions/soilTests';

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
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    red:   'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
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
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 leading-tight">{label}</label>
        {bench && <BenchmarkBadge status={bench.status} label={bench.label} />}
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        <input
          type="number"
          step="any"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="—"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {unit && <span className="text-[10px] text-slate-400 shrink-0 whitespace-nowrap">{unit}</span>}
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="col-span-full">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-1.5">
        {title}
      </p>
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

  const setSoilField = (key: keyof typeof EMPTY_SOIL) => (v: string) =>
    setSoil(s => ({ ...s, [key]: v }));

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBlockId(defaultBlockId ?? '');
      setRecordedAt(''); setLabReference('');
      setPh(''); setSoilEc(''); setWaterEc('');
      setSoilMoisture(''); setRootZoneTemp(''); setWaterDeficit('');
      setSoil({ ...EMPTY_SOIL });
      setNotes(''); setFile(null); setError(null);
      setExtractedCount(null); setExtractMsg(null);
    }
  }, [open, defaultBlockId]);

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

  const inputCls = 'rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <FlaskConical className="h-5 w-5 text-brand-600 dark:text-brand-400 shrink-0" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Log Lab Test Result</h2>
              <p className="text-sm text-slate-500 mt-0.5">Record soil and water analysis with benchmark comparison.</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form body */}
        <div className="overflow-y-auto px-6 py-4 flex flex-col gap-5">

          {/* Sample info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SectionHeader title="Sample Information" />
            <div className="col-span-3 flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Block / Scope</label>
              <select value={blockId} onChange={e => setBlockId(e.target.value)} className={inputCls}>
                <option value="__farm__">🌾 Whole Farm (no specific block)</option>
                {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Test Date</label>
              <input type="date" value={recordedAt} onChange={e => setRecordedAt(e.target.value)} className={inputCls} />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Lab Reference</label>
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
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Texture Class</label>
              <select
                value={soil.textureClass}
                onChange={e => setSoilField('textureClass')(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
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
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 px-4 py-3 text-sm text-slate-500 hover:border-brand-400 hover:text-brand-600 dark:hover:border-brand-500 dark:hover:text-brand-400 transition-colors">
              {extracting
                ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-500" />
                : <Paperclip className="h-4 w-4 shrink-0" />}
              <span className="truncate">
                {extracting
                  ? 'Reading document and extracting values…'
                  : file ? file.name : 'Attach lab report (PDF or image) — values will be extracted automatically'}
              </span>
              <input
                type="file"
                accept=".pdf,image/*"
                className="sr-only"
                onChange={e => handleFileSelect(e.target.files?.[0] ?? null)}
              />
            </label>
            {extractMsg && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                {extractMsg}
              </div>
            )}
            {extractedCount !== null && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                {extractedCount > 0
                  ? `${extractedCount} field${extractedCount === 1 ? '' : 's'} auto-filled from document — review and adjust as needed.`
                  : 'Could not extract values from this document — please fill in manually.'}
              </div>
            )}
          </div>

        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/20 px-4 py-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-700 px-6 py-4 shrink-0">
          <button onClick={onClose} className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Test Result
          </button>
        </div>

      </div>
    </div>
  );
}
