'use client';

import { useState } from 'react';
import { X, CheckCircle, Clock, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CalendarEvent, ACTIVITY_COLORS, ACTIVITY_LABELS } from './types';

type MaterialActualState = {
  consumableId: string;
  consumableName: string;
  unit: string;
  currentBalance: number;
  plannedQuantity: number;
  actualQuantity: string;
};

type MaterialActual = { consumableId: string; actualQuantity: number; currentBalance: number };

interface LogCompletionModalProps {
  event: CalendarEvent;
  onClose: () => void;
  onComplete: (eventId: string, actualStart: Date, actualEnd: Date, notes: string, materialActuals: MaterialActual[]) => void;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }
function toDatetimeLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export default function LogCompletionModal({ event, onClose, onComplete }: LogCompletionModalProps) {
  const t = useTranslations('calendar.logCompletion');
  const colors = ACTIVITY_COLORS[event.type];

  const [actualStart, setActualStart] = useState(toDatetimeLocal(event.startDate));
  const [actualEnd,   setActualEnd]   = useState(toDatetimeLocal(event.endDate));
  const [notes,       setNotes]       = useState('');

  const [materialActuals, setMaterialActuals] = useState<MaterialActualState[]>(() =>
    (event.materials ?? []).map((m) => ({
      consumableId: m.consumableId,
      consumableName: m.consumableName,
      unit: m.unit,
      currentBalance: m.currentBalance,
      plannedQuantity: m.plannedQuantity,
      actualQuantity: String(m.plannedQuantity),
    }))
  );

  const fieldCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white';
  const labelCls = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const actuals: MaterialActual[] = materialActuals
      .map((m) => ({ consumableId: m.consumableId, actualQuantity: Number(m.actualQuantity), currentBalance: m.currentBalance }))
      .filter((m) => m.actualQuantity > 0);
    onComplete(event.id, new Date(actualStart), new Date(actualEnd), notes, actuals);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('title')}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={`mx-6 mt-5 rounded-xl px-4 py-3 ring-1 ring-inset ${colors.bg} ${colors.ring}`}>
          <span className={`mb-1 inline-flex items-center gap-1 text-xs font-semibold ${colors.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
            {ACTIVITY_LABELS[event.type]}
          </span>
          <p className={`font-semibold text-sm ${colors.text}`}>{event.title}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            <span className={`flex items-center gap-1 text-xs opacity-70 ${colors.text}`}>
              <Clock className="h-3 w-3" />
              {event.startDate.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            {event.block && (
              <span className={`flex items-center gap-1 text-xs opacity-70 ${colors.text}`}>
                <MapPin className="h-3 w-3" />
                {event.block}
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('actualStart')}</label>
              <input id="actual-start" type="datetime-local" className={fieldCls}
                value={actualStart} onChange={(e) => setActualStart(e.target.value)} required />
            </div>
            <div>
              <label className={labelCls}>{t('actualEnd')}</label>
              <input id="actual-end" type="datetime-local" className={fieldCls}
                value={actualEnd} onChange={(e) => setActualEnd(e.target.value)} required />
            </div>
          </div>

          {materialActuals.length > 0 && (
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                Materials Used
              </p>
              <div className="space-y-2">
                {materialActuals.map((m, i) => {
                  const qty = Number(m.actualQuantity);
                  const isOver = qty > m.currentBalance;
                  return (
                    <div key={m.consumableId} className="flex items-center gap-3">
                      <span className="flex-1 min-w-0 truncate text-sm text-slate-700 dark:text-slate-300">
                        {m.consumableName}
                        <span className="ml-1 text-xs text-slate-400">(planned: {m.plannedQuantity} {m.unit})</span>
                      </span>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={m.actualQuantity}
                            onChange={(e) =>
                              setMaterialActuals((prev) =>
                                prev.map((x, j) => j === i ? { ...x, actualQuantity: e.target.value } : x)
                              )
                            }
                            className={`w-24 rounded-lg border px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:bg-slate-800 dark:text-white ${
                              isOver
                                ? 'border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-900/20'
                                : 'border-slate-200 bg-white dark:border-slate-700'
                            }`}
                          />
                          <span className="text-xs text-slate-500 w-8">{m.unit}</span>
                        </div>
                        {isOver && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400">
                            Stock: {m.currentBalance} {m.unit}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>{t('notes')}</label>
            <textarea id="completion-notes" rows={3} className={`${fieldCls} resize-none`}
              value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder={t('notesPlaceholder')} />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">
              {t('cancel')}
            </button>
            <button type="submit" id="mark-complete-btn"
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 active:scale-95 transition-all">
              <CheckCircle className="h-4 w-4" />
              {t('markComplete')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
