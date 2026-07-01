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
  const [fertilizerConsumableId, setFertilizerConsumableId] = useState('');
  const [fertigationTotalQty, setFertigationTotalQty]       = useState('');
  const [amountKgPerTree, setAmountKgPerTree]     = useState('');
  const [growthStageNote, setGrowthStageNote]     = useState('');
  const [pesticideType, setPesticideType]         = useState('');
  const [pesticideConsumableId, setPesticideConsumableId]   = useState('');
  const [sprayingTotalQty, setSprayingTotalQty]             = useState('');
  const [amountLPerHa, setAmountLPerHa]           = useState('');
  const [pestTarget, setPestTarget]               = useState('');
  const [pruningType, setPruningType]             = useState('');

  const [materials, setMaterials]         = useState<PlannedMaterial[]>([]);
  const [pickedConsumableId, setPickedConsumableId] = useState('');
  const [pickedQty, setPickedQty]         = useState('');

  const fieldCls = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder-ink-4 focus:border-green focus:outline-none focus:ring-2 focus:ring-green/20';
  const labelCls = 'mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wide text-ink-3';

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
    // Merge inline qty fields into the materials list
    let finalMaterials = [...materials.filter(m => m.plannedQuantity > 0)];

    if (type === 'fertigation' && fertilizerConsumableId && Number(fertigationTotalQty) > 0) {
      const cons = consumables.find(c => c.id === fertilizerConsumableId);
      if (cons) {
        const already = finalMaterials.find(m => m.consumableId === cons.id);
        if (!already) {
          finalMaterials = [...finalMaterials, { consumableId: cons.id, consumableName: cons.name, unit: cons.unit, plannedQuantity: Number(fertigationTotalQty) }];
        }
      }
    }

    if (type === 'spraying' && pesticideConsumableId && Number(sprayingTotalQty) > 0) {
      const cons = consumables.find(c => c.id === pesticideConsumableId);
      if (cons) {
        const already = finalMaterials.find(m => m.consumableId === cons.id);
        if (!already) {
          finalMaterials = [...finalMaterials, { consumableId: cons.id, consumableName: cons.name, unit: cons.unit, plannedQuantity: Number(sprayingTotalQty) }];
        }
      }
    }

    onSave(event, finalMaterials);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-surface shadow-2xl border border-line">
        <div className="flex items-center justify-between border-b border-line-soft px-6 py-4">
          <h2 className="font-heading text-lg font-semibold text-ink">{t('title')}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-3 hover:bg-tile transition-colors">
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
            <div className="rounded-xl bg-blue-soft p-4 border border-blue/15 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue">{t('irrigationDetails')}</p>
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
            <div className="rounded-xl bg-gold-soft p-4 border border-gold/15 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gold">{t('fertigationDetails')}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{t('fertilizerType')}</label>
                  {(() => {
                    const opts = consumables.filter(c => c.category === 'fertilizer').length > 0
                      ? consumables.filter(c => c.category === 'fertilizer')
                      : consumables;
                    return opts.length > 0 ? (
                      <select className={fieldCls} value={fertilizerConsumableId} onChange={(e) => {
                        const id = e.target.value;
                        setFertilizerConsumableId(id);
                        const cons = opts.find(c => c.id === id);
                        setFertilizerType(cons?.name ?? '');
                      }}>
                        <option value="">-- Select fertilizer --</option>
                        {opts.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.currentBalance} {c.unit} avail.)</option>
                        ))}
                      </select>
                    ) : (
                      <input className={fieldCls} value={fertilizerType} onChange={(e) => setFertilizerType(e.target.value)} placeholder={t('fertilizerPlaceholder')} />
                    );
                  })()}
                </div>
                <div>
                  <label className={labelCls}>Total Qty ({consumables.find(c => c.id === fertilizerConsumableId)?.unit ?? 'kg'})</label>
                  <input
                    type="number"
                    className={fieldCls}
                    value={fertigationTotalQty}
                    onChange={(e) => setFertigationTotalQty(e.target.value)}
                    min="0" step="0.01"
                    placeholder="e.g. 200"
                    disabled={!fertilizerConsumableId}
                  />
                </div>
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
            <div className="rounded-xl bg-purple-soft p-4 border border-purple/15 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-purple">{t('sprayingDetails')}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{t('pesticideProduct')}</label>
                  {(() => {
                    const opts = consumables.filter(c => c.category === 'pesticide' || c.category === 'herbicide').length > 0
                      ? consumables.filter(c => c.category === 'pesticide' || c.category === 'herbicide')
                      : consumables;
                    return opts.length > 0 ? (
                      <select className={fieldCls} value={pesticideConsumableId} onChange={(e) => {
                        const id = e.target.value;
                        setPesticideConsumableId(id);
                        const cons = opts.find(c => c.id === id);
                        setPesticideType(cons?.name ?? '');
                      }}>
                        <option value="">-- Select product --</option>
                        {opts.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.currentBalance} {c.unit} avail.)</option>
                        ))}
                      </select>
                    ) : (
                      <input className={fieldCls} value={pesticideType} onChange={(e) => setPesticideType(e.target.value)} placeholder={t('pesticidePlaceholder')} />
                    );
                  })()}
                </div>
                <div>
                  <label className={labelCls}>Total Qty ({consumables.find(c => c.id === pesticideConsumableId)?.unit ?? 'L'})</label>
                  <input
                    type="number"
                    className={fieldCls}
                    value={sprayingTotalQty}
                    onChange={(e) => setSprayingTotalQty(e.target.value)}
                    min="0" step="0.01"
                    placeholder="e.g. 50"
                    disabled={!pesticideConsumableId}
                  />
                </div>
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
            <div className="rounded-xl bg-teal-soft p-4 border border-teal/15 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal">{t('pruningDetails')}</p>
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

          {consumables.length > 0 && type !== 'fertigation' && type !== 'spraying' && (
            <div className="rounded-xl bg-tile p-4 border border-line space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">
                Planned Materials
              </p>
              {materials.length > 0 && (
                <ul className="space-y-1.5">
                  {materials.map((m, i) => (
                    <li key={m.consumableId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-ink-2">{m.consumableName}</span>
                      <span className="shrink-0 text-ink-3">{m.plannedQuantity} {m.unit}</span>
                      <button type="button"
                        onClick={() => setMaterials((prev) => prev.filter((_, j) => j !== i))}
                        className="shrink-0 text-xs text-red/70 hover:text-red transition-colors">
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
                  className="shrink-0 rounded-lg bg-tile-2 px-3 py-2 text-sm font-medium text-ink-2 hover:bg-line transition-colors whitespace-nowrap">
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
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:border-ink-4 transition-colors">
              {t('cancel')}
            </button>
            <button type="submit" id="save-event-btn"
              className="rounded-lg bg-green px-5 py-2 text-sm font-medium text-white shadow-sm hover:brightness-105 transition-all">
              {t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
