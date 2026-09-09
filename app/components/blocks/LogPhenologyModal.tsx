"use client";

import { useState } from 'react';
import { X, Loader2, Sprout } from 'lucide-react';
import { logPhenologyEvent } from '@/app/actions/phenology';
import type { PhenologyEventType } from '@/app/actions/phenology-types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  farmId: string;
  blockId: string;
  blockName: string;
}

// Ordered as they occur through the season. Bloom leads because it is the
// anchor every downstream prediction is measured from.
const EVENT_OPTIONS: { value: PhenologyEventType; label: string; hint: string }[] = [
  { value: 'full-bloom',    label: '🌸 Full Bloom',    hint: 'About 70–80% of blossoms open — the key anchor date' },
  { value: 'bud-break',     label: '🌿 Bud Break',     hint: 'First green tissue visible on the buds' },
  { value: 'petal-fall',    label: '🍃 Petal Fall',    hint: 'Most petals have dropped' },
  { value: 'hull-split',    label: '🔓 Hull Split',    hint: 'First hulls beginning to split' },
  { value: 'harvest-start', label: '🌾 Harvest Start', hint: 'Shaking began' },
  { value: 'harvest-end',   label: '✅ Harvest End',   hint: 'Last of the crop off the ground' },
];

export default function LogPhenologyModal({
  open, onClose, onSaved, farmId, blockId, blockName,
}: Props) {
  const today = new Date().toISOString().split('T')[0];

  const [eventType, setEventType] = useState<PhenologyEventType>('full-bloom');
  const [observedOn, setObservedOn] = useState(today);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('farmId', farmId);
      fd.append('blockId', blockId);
      fd.append('eventType', eventType);
      fd.append('observedOn', observedOn);
      fd.append('notes', notes);

      const result = await logPhenologyEvent(fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      // Reset so the modal is clean if reopened for another observation.
      setNotes('');
      setEventType('full-bloom');
      setObservedOn(today);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save observation.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const inputCls = 'rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder-ink-4 focus:outline-none focus:ring-2 focus:ring-green w-full';
  const selected = EVENT_OPTIONS.find(o => o.value === eventType);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-surface shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <Sprout className="h-5 w-5 text-green shrink-0" />
            <div>
              <h2 className="font-heading text-lg font-semibold text-ink">Log Observation</h2>
              <p className="text-xs text-ink-3 mt-0.5">{blockName}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-4 hover:bg-tile hover:text-ink-2 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 flex flex-col gap-4">
          <p className="rounded-lg border border-green/25 bg-green-soft px-3 py-2.5 text-xs text-ink-2">
            Growth stage is something you see in the orchard, not something the sensors can
            measure. Logging the date you observed it lets the system predict hull split and
            the harvest window from accumulated heat.
          </p>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-2">Event</label>
            <select
              value={eventType}
              onChange={e => setEventType(e.target.value as PhenologyEventType)}
              className={inputCls}
            >
              {EVENT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {selected && <p className="text-xs text-ink-4">{selected.hint}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-2">Date observed</label>
            <input
              type="date"
              value={observedOn}
              max={today}
              onChange={e => setObservedOn(e.target.value)}
              className={inputCls}
            />
            <p className="text-xs text-ink-4">
              Backdating is fine — enter the date you actually saw it, not today.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-2">Notes <span className="text-ink-4 font-normal">(optional)</span></label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. uneven across the block, north rows ahead"
              className={inputCls}
            />
          </div>

          <p className="text-xs text-ink-4">
            Logging the same event again for this season replaces the earlier date.
          </p>

          {error && (
            <div className="rounded-lg border border-red/30 bg-red-soft px-3 py-2 text-sm text-red">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-line px-6 py-4 shrink-0">
          <button
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:border-ink-4 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !observedOn}
            className="flex items-center gap-2 rounded-lg bg-green px-4 py-2 text-sm font-medium text-white hover:brightness-105 transition-colors disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Observation
          </button>
        </div>

      </div>
    </div>
  );
}
