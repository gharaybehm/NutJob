'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { CalendarEvent, ActivityType, ACTIVITY_LABELS, BLOCKS } from './types';

interface AddEventModalProps {
  defaultDate?: Date;
  onClose: () => void;
  onSave: (event: CalendarEvent) => void;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }
function toDatetimeLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const ACTIVITY_TYPES: ActivityType[] = ['irrigation', 'fertigation', 'spraying', 'pruning', 'scouting', 'pollinating', 'tilling', 'plowing', 'weeding', 'other'];

export default function AddEventModal({ defaultDate, onClose, onSave }: AddEventModalProps) {
  const now = defaultDate ?? new Date();
  const later = new Date(now);
  later.setHours(later.getHours() + 2);

  const [title, setTitle]     = useState('');
  const [type, setType]       = useState<ActivityType>('irrigation');
  const [block, setBlock]     = useState('');
  const [start, setStart]     = useState(toDatetimeLocal(now));
  const [end, setEnd]         = useState(toDatetimeLocal(later));
  const [notes, setNotes]     = useState('');

  // Type-specific fields
  const [durationHours, setDurationHours]         = useState('4');
  const [litresPerTree, setLitresPerTree]         = useState('2');
  const [repeatDays, setRepeatDays]               = useState('14');
  const [fertilizerType, setFertilizerType]       = useState('');
  const [amountKgPerTree, setAmountKgPerTree]     = useState('');
  const [growthStageNote, setGrowthStageNote]     = useState('');
  const [pesticideType, setPesticideType]         = useState('');
  const [amountLPerHa, setAmountLPerHa]           = useState('');
  const [pestTarget, setPestTarget]               = useState('');
  const [pruningType, setPruningType]             = useState('');

  const fieldCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500';
  const labelCls = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const startDate = new Date(start);
    const endDate   = new Date(end);
    const event: CalendarEvent = {
      id: `evt-${Date.now()}`,
      title: title || ACTIVITY_LABELS[type],
      type,
      startDate,
      endDate,
      block: block || undefined,
      notes: notes || undefined,
      details: {
        ...(type === 'irrigation' && {
          durationHours: parseFloat(durationHours),
          litresPerTree: parseFloat(litresPerTree),
          repeatDays:    parseInt(repeatDays),
        }),
        ...(type === 'fertigation' && {
          fertilizerType,
          amountKgPerTree: parseFloat(amountKgPerTree),
          growthStageNote,
        }),
        ...(type === 'spraying' && {
          pesticideType,
          amountLPerHa: parseFloat(amountLPerHa),
          pestTarget,
        }),
        ...(type === 'pruning' && { pruningType, growthStageNote }),
      },
    };
    onSave(event);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Add Event</h2>
          <button onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {/* Title */}
          <div>
            <label className={labelCls}>Title</label>
            <input id="event-title" className={fieldCls} value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Irrigation Run — Block A" />
          </div>

          {/* Activity type */}
          <div>
            <label className={labelCls}>Activity Type</label>
            <select id="event-type" className={fieldCls} value={type}
              onChange={(e) => setType(e.target.value as ActivityType)}>
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>{ACTIVITY_LABELS[t]}</option>
              ))}
            </select>
          </div>

          {/* Block */}
          <div>
            <label className={labelCls}>Block</label>
            <select id="event-block" className={fieldCls} value={block}
              onChange={(e) => setBlock(e.target.value)}>
              <option value="">All / Not applicable</option>
              {BLOCKS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          {/* Date / time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Start</label>
              <input id="event-start" type="datetime-local" className={fieldCls}
                value={start} onChange={(e) => setStart(e.target.value)} required />
            </div>
            <div>
              <label className={labelCls}>End</label>
              <input id="event-end" type="datetime-local" className={fieldCls}
                value={end} onChange={(e) => setEnd(e.target.value)} required />
            </div>
          </div>

          {/* Type-specific fields */}
          {type === 'irrigation' && (
            <div className="rounded-xl bg-blue-50 p-4 ring-1 ring-blue-100 dark:bg-blue-900/20 dark:ring-blue-800 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Irrigation Details</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Duration (hrs)</label>
                  <input type="number" className={fieldCls} value={durationHours}
                    onChange={(e) => setDurationHours(e.target.value)} min="0" step="0.5" />
                </div>
                <div>
                  <label className={labelCls}>L/tree</label>
                  <input type="number" className={fieldCls} value={litresPerTree}
                    onChange={(e) => setLitresPerTree(e.target.value)} min="0" step="0.1" />
                </div>
                <div>
                  <label className={labelCls}>Repeat (days)</label>
                  <input type="number" className={fieldCls} value={repeatDays}
                    onChange={(e) => setRepeatDays(e.target.value)} min="0" />
                </div>
              </div>
            </div>
          )}

          {type === 'fertigation' && (
            <div className="rounded-xl bg-green-50 p-4 ring-1 ring-green-100 dark:bg-green-900/20 dark:ring-green-800 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-green-600 dark:text-green-400">Fertigation Details</p>
              <div>
                <label className={labelCls}>Fertilizer type</label>
                <input className={fieldCls} value={fertilizerType}
                  onChange={(e) => setFertilizerType(e.target.value)} placeholder="e.g. Calcium Nitrate" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Amount (kg/tree)</label>
                  <input type="number" className={fieldCls} value={amountKgPerTree}
                    onChange={(e) => setAmountKgPerTree(e.target.value)} min="0" step="0.01" />
                </div>
                <div>
                  <label className={labelCls}>Growth stage note</label>
                  <input className={fieldCls} value={growthStageNote}
                    onChange={(e) => setGrowthStageNote(e.target.value)} placeholder="e.g. Nut fill" />
                </div>
              </div>
            </div>
          )}

          {type === 'spraying' && (
            <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-100 dark:bg-amber-900/20 dark:ring-amber-800 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">Spraying Details</p>
              <div>
                <label className={labelCls}>Pesticide / product</label>
                <input className={fieldCls} value={pesticideType}
                  onChange={(e) => setPesticideType(e.target.value)} placeholder="e.g. Mancozeb" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Amount (L/ha)</label>
                  <input type="number" className={fieldCls} value={amountLPerHa}
                    onChange={(e) => setAmountLPerHa(e.target.value)} min="0" step="0.1" />
                </div>
                <div>
                  <label className={labelCls}>Target pest / disease</label>
                  <input className={fieldCls} value={pestTarget}
                    onChange={(e) => setPestTarget(e.target.value)} placeholder="e.g. Alternaria" />
                </div>
              </div>
            </div>
          )}

          {type === 'pruning' && (
            <div className="rounded-xl bg-purple-50 p-4 ring-1 ring-purple-100 dark:bg-purple-900/20 dark:ring-purple-800 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400">Pruning Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Pruning type</label>
                  <select className={fieldCls} value={pruningType}
                    onChange={(e) => setPruningType(e.target.value)}>
                    <option value="">Select type…</option>
                    <option>Thinning (canopy light)</option>
                    <option>Skirting (skirt lift)</option>
                    <option>Heading back (height reduction)</option>
                    <option>Renewal pruning</option>
                    <option>Corrective pruning</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Growth stage note</label>
                  <input className={fieldCls} value={growthStageNote}
                    onChange={(e) => setGrowthStageNote(e.target.value)} placeholder="e.g. Post-harvest" />
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes (optional)</label>
            <textarea id="event-notes" rows={2} className={`${fieldCls} resize-none`}
              value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional instructions or observations…" />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">
              Cancel
            </button>
            <button type="submit" id="save-event-btn"
              className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 active:scale-95 transition-all">
              Save Event
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
