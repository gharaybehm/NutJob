"use client";

import { useState } from 'react';
import { X, Loader2, Leaf } from 'lucide-react';
import { logTissueSample } from '@/app/actions/tissue';
import { leafFormFields, leafReferenceFor } from '@/engines/nutrition';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  farmId: string;
  blockId: string;
  blockName: string;
  cropType: string;
}

export default function LogTissueSampleModal({
  open, onClose, onSaved, farmId, blockId, blockName, cropType,
}: Props) {
  const today = new Date().toISOString().split('T')[0];
  const fields = leafFormFields(cropType);
  const reference = leafReferenceFor(cropType);

  const [sampledAt, setSampledAt] = useState(today);
  const [labReference, setLabReference] = useState('');
  const [notes, setNotes] = useState('');
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    const values: Record<string, number> = {};
    for (const f of fields) {
      const raw = (entries[f.key] ?? '').trim().replace(',', '.');
      if (raw === '') continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) { setError(`${f.label} must be a number.`); return; }
      values[f.key] = n;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('farmId', farmId);
      fd.append('blockId', blockId);
      fd.append('sampledAt', sampledAt);
      fd.append('labReference', labReference);
      fd.append('notes', notes);
      fd.append('values', JSON.stringify(values));
      const result = await logTissueSample(fd);
      if (result.error) { setError(result.error); return; }
      setEntries({}); setLabReference(''); setNotes(''); setSampledAt(today);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the sample.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const inputCls = 'rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder-ink-4 focus:outline-none focus:ring-2 focus:ring-green w-full';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-surface shadow-2xl flex flex-col max-h-[92vh]">

        <div className="flex items-center justify-between border-b border-line px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <Leaf className="h-5 w-5 text-green shrink-0" />
            <div>
              <h2 className="font-heading text-lg font-semibold text-ink">Log Leaf Analysis</h2>
              <p className="text-xs text-ink-3 mt-0.5">{blockName}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-4 hover:bg-tile hover:text-ink-2 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4 flex flex-col gap-4">
          {!reference ? (
            <p className="rounded-lg border border-amber/30 bg-amber-soft px-3 py-2.5 text-xs text-ink-2">
              No leaf-tissue reference is loaded for {cropType ? `"${cropType}"` : 'this crop'} yet, so a leaf
              analysis cannot be recorded here.
            </p>
          ) : (
            <p className="rounded-lg border border-green/25 bg-green-soft px-3 py-2.5 text-xs text-ink-2">
              Enter the values exactly as the lab reports them, in the unit shown. Leave blank what was not
              measured. The reference values apply to leaves sampled {reference.window.label}.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink-2">Sample date</label>
              <input type="date" value={sampledAt} max={today} onChange={e => setSampledAt(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink-2">Lab report no. <span className="text-ink-4 font-normal">(optional)</span></label>
              <input value={labReference} onChange={e => setLabReference(e.target.value)} className={inputCls} />
            </div>
          </div>

          {fields.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {fields.map(f => (
                <div key={f.key} className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-ink-2">
                    {f.symbol} <span className="text-ink-4 font-normal">{f.unit}</span>
                  </label>
                  <input
                    inputMode="decimal"
                    value={entries[f.key] ?? ''}
                    onChange={e => setEntries(prev => ({ ...prev, [f.key]: e.target.value }))}
                    aria-label={`${f.label} (${f.unit})`}
                    className={inputCls}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-2">Notes <span className="text-ink-4 font-normal">(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={inputCls}
              placeholder="e.g. spur leaves, mid-canopy, 20 trees sampled" />
          </div>

          {error && (
            <div className="rounded-lg border border-red/30 bg-red-soft px-3 py-2 text-sm text-red">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-line px-6 py-4 shrink-0">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:border-ink-4 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !sampledAt || fields.length === 0}
            className="flex items-center gap-2 rounded-lg bg-green px-4 py-2 text-sm font-medium text-white hover:brightness-105 transition-colors disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Analysis
          </button>
        </div>
      </div>
    </div>
  );
}
