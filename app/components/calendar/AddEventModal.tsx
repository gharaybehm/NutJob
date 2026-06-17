'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CalendarEvent, ActivityType, PlannedMaterial, ACTIVITY_LABELS, BLOCKS } from './types';

type ConsumableSummary = { id: string; name: string; unit: string; currentBalance: number; category: string };

interface AddEventModalProps {
  defaultDate?: Date;
  consumables?: ConsumableSummary[];
  onClose: () => void;
  onSave: (event: CalendarEvent, materials: PlannedMaterial[]) => void;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }
function toDatetimeLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const ACTIVITY_TYPES: ActivityType[] = ['irrigation', 'fertigation', 'spraying', 'pruning', 'scouting', 'pollinating', 'tilling', 'plowing', 'weeding', 'other'];

export default function AddEventModal({ defaultDate, consumables = [], onClose, onSave }: AddEventModalProps) {
  const t = useTranslations('calendar.addEvent');
  const tTypes = useTranslations('activityTypes');
  const TYPE_LABELS: Record<ActivityType, string> = {
    irrigation: tTypes('irrigation'), fertigation: tTypes('fertigation'),
    spraying: tTypes('spraying'), pruning: tTypes('pruning'), scouting: tTypes('scouting'),
    pollinating: tTypes('pollinating'), tilling: tTypes('tilling'), plowing: tTypes('plowing'),
    weeding: tTypes('weeding'), other: tTypes('other'), 'weather-alert': 'Weather Alert',
  };

  const now = defaultDate ?? new Date();
  const later = new Date(now);
  later.setHours(later.getHours() + 2);

  const [title, setTitle]     = useState('');
  const [type, setType]       = useState<ActivityType>('irrigation');
  const [block, setBlock]     = useState('');
  const [start, setStart]     = useState(toDatetimeLocal(now));
  const [end, setEnd]         = useState(toDatetimeLocal(later));
  const [notes, setNotes]     = useState('');

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

  const [materials, setMaterials]         = useState<PlannedMaterial[]>([]);
  const [pickedConsumableId, setPickedConsumableId] = useState('');
  const [pickedQty, setPickedQty]         = useState('');

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
    onSave(event, materials);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('title')}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div>
            <label className={labelCls}>{t('fieldTitle')}</label>
            <input id="event-title" className={fieldCls} value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={t('titlePlaceholder')} />
          </div>

          <div>
            <label className={labelCls}>{t('activityType')}</label>
            <select id="event-type" className={fieldCls} value={type} onChange={(e) => setType(e.target.value as ActivityType)}>
              {ACTIVITY_TYPES.map((at) => (
                <option key={at} value={at}>{TYPE_LABELS[at]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>{t('block')}</label>
            <select id="event-block" className={fieldCls} value={block} onChange={(e) => setBlock(e.target.value)}>
              <option value="">{t('allBlocks')}</option>
              {BLOCKS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('start')}</label>
              <input id="event-start" type="datetime-local" className={fieldCls} value={start} onChange={(e) => setStart(e.target.value)} required />
            </div>
            <div>
              <label className={labelCls}>{t('end')}</label>
              <input id="event-end" type="datetime-local" className={fieldCls} value={end} onChange={(e) => setEnd(e.target.value)} required />
            </div>
          </div>

          {type === 'irrigation' && (
            <div className="rounded-xl bg-blue-50 p-4 ring-1 ring-blue-100 dark:bg-blue-900/20 dark:ring-blue-800 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">{t('irrigationDetails')}</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>{t('durationHrs')}</label>
                  <input type="number" className={fieldCls} value={durationHours} onChange={(e) => setDurationHours(e.target.value)} min="0" step="0.5" />
                </div>
                <div>
                  <label className={labelCls}>{t('litresPerTree')}</label>
                  <input type="number" className={fieldCls} value={litresPerTree} onChange={(e) => setLitresPerTree(e.target.value)} min="0" step="0.1" />
                </div>
                <div>
                  <label className={labelCls}>{t('repeatDays')}</label>
                  <input type="number" className={fieldCls} value={repeatDays} onChange={(e) => setRepeatDays(e.target.value)} min="0" />
                </div>
              </div>
            </div>
          )}

          {type === 'fertigation' && (
            <div className="rounded-xl bg-green-50 p-4 ring-1 ring-green-100 dark:bg-green-900/20 dark:ring-green-800 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-green-600 dark:text-green-400">{t('fertigationDetails')}</p>
              <div>
                <label className={labelCls}>{t('fertilizerType')}</label>
                <input className={fieldCls} value={fertilizerType} onChange={(e) => setFertilizerType(e.target.value)} placeholder={t('fertilizerPlaceholder')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{t('amountKgPerTree')}</label>
                  <input type="number" className={fieldCls} value={amountKgPerTree} onChange={(e) => setAmountKgPerTree(e.target.value)} min="0" step="0.01" />
                </div>
                <div>
                  <label className={labelCls}>{t('growthStageNote')}</label>
                  <input className={fieldCls} value={growthStageNote} onChange={(e) => setGrowthStageNote(e.target.value)} placeholder={t('growthStagePlaceholder')} />
                </div>
              </div>
            </div>
          )}

          {type === 'spraying' && (
            <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-100 dark:bg-amber-900/20 dark:ring-amber-800 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">{t('sprayingDetails')}</p>
              <div>
                <label className={labelCls}>{t('pesticideProduct')}</label>
                <input className={fieldCls} value={pesticideType} onChange={(e) => setPesticideType(e.target.value)} placeholder={t('pesticidePlaceholder')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{t('amountLPerHa')}</label>
                  <input type="number" className={fieldCls} value={amountLPerHa} onChange={(e) => setAmountLPerHa(e.target.value)} min="0" step="0.1" />
                </div>
                <div>
                  <label className={labelCls}>{t('targetPest')}</label>
                  <input className={fieldCls} value={pestTarget} onChange={(e) => setPestTarget(e.target.value)} placeholder={t('targetPestPlaceholder')} />
                </div>
              </div>
            </div>
          )}

          {type === 'pruning' && (
            <div className="rounded-xl bg-purple-50 p-4 ring-1 ring-purple-100 dark:bg-purple-900/20 dark:ring-purple-800 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400">{t('pruningDetails')}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{t('pruningType')}</label>
                  <select className={fieldCls} value={pruningType} onChange={(e) => setPruningType(e.target.value)}>
                    <option value="">{t('selectType')}</option>
                    <option value="thinning">{t('pruningThinning')}</option>
                    <option value="skirting">{t('pruningSkirting')}</option>
                    <option value="heading">{t('pruningHeading')}</option>
                    <option value="renewal">{t('pruningRenewal')}</option>
                    <option value="corrective">{t('pruningCorrective')}</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{t('growthStageNote')}</label>
                  <input className={fieldCls} value={growthStageNote} onChange={(e) => setGrowthStageNote(e.target.value)} placeholder={t('growthStagePostHarvest')} />
                </div>
              </div>
            </div>
          )}

          {consumables.length > 0 && (
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                Planned Materials
              </p>
              {materials.length > 0 && (
                <ul className="space-y-1.5">
                  {materials.map((m, i) => (
                    <li key={m.consumableId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-slate-700 dark:text-slate-300">{m.consumableName}</span>
                      <span className="shrink-0 text-slate-500">{m.plannedQuantity} {m.unit}</span>
                      <button type="button"
                        onClick={() => setMaterials((prev) => prev.filter((_, j) => j !== i))}
                        className="shrink-0 text-xs text-red-400 hover:text-red-600 transition-colors">
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2 items-end">
                <div className="flex-1 min-w-0">
                  <label className={labelCls}>Consumable</label>
                  <select className={fieldCls} value={pickedConsumableId}
                    onChange={(e) => setPickedConsumableId(e.target.value)}>
                    <option value="">-- Select --</option>
                    {consumables.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.unit})</option>
                    ))}
                  </select>
                </div>
                <div className="w-24 shrink-0">
                  <label className={labelCls}>Qty</label>
                  <input type="number" className={fieldCls} value={pickedQty}
                    onChange={(e) => setPickedQty(e.target.value)} min="0.01" step="0.01" />
                </div>
                <button type="button"
                  onClick={() => {
                    const c = consumables.find((x) => x.id === pickedConsumableId);
                    const qty = Number(pickedQty);
                    if (!c || !qty || qty <= 0) return;
                    setMaterials((prev) => {
                      const existing = prev.find((m) => m.consumableId === c.id);
                      if (existing) {
                        return prev.map((m) => m.consumableId === c.id ? { ...m, plannedQuantity: qty } : m);
                      }
                      return [...prev, { consumableId: c.id, consumableName: c.name, unit: c.unit, plannedQuantity: qty }];
                    });
                    setPickedConsumableId('');
                    setPickedQty('');
                  }}
                  className="shrink-0 rounded-lg bg-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 transition-colors whitespace-nowrap">
                  + Add
                </button>
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>{t('notes')}</label>
            <textarea id="event-notes" rows={2} className={`${fieldCls} resize-none`}
              value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('notesPlaceholder')} />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">
              {t('cancel')}
            </button>
            <button type="submit" id="save-event-btn"
              className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 active:scale-95 transition-all">
              {t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
