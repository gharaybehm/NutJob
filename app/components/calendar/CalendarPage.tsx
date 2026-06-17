'use client';

import { useState, useCallback, useTransition, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import CalendarHeader, { CalendarView } from './CalendarHeader';
import MonthView from './MonthView';
import WeekView from './WeekView';
import DayView from './DayView';
import dynamic from 'next/dynamic';
const AddEventModal = dynamic(() => import('./AddEventModal'), { ssr: false });
const LogCompletionModal = dynamic(() => import('./LogCompletionModal'), { ssr: false });
import { CalendarEvent, PlannedMaterial, ACTIVITY_COLORS, ACTIVITY_LABELS } from './types';
import { createEvent, logEventCompletion } from '@/app/(dashboard)/calendar/actions';

type ConsumableSummary = { id: string; name: string; unit: string; currentBalance: number; category: string };
type MaterialActual = { consumableId: string; actualQuantity: number; currentBalance: number };

// ─── Formatting helpers ───────────────────────────────────────────────────────

function getWeekRange(date: Date, locale: string): string {
  const dow = date.getDay();
  const start = new Date(date); start.setDate(date.getDate() - dow);
  const end   = new Date(date); end.setDate(date.getDate() + (6 - dow));
  const fmtShort = (d: Date) =>
    `${d.getDate()} ${new Intl.DateTimeFormat(locale, { month: 'short' }).format(d)}`;
  if (start.getMonth() === end.getMonth()) {
    return `${fmtShort(start)} – ${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${fmtShort(start)} – ${fmtShort(end)} ${end.getFullYear()}`;
}

function getLabel(view: CalendarView, date: Date, locale: string): string {
  if (view === 'month') {
    return `${new Intl.DateTimeFormat(locale, { month: 'long' }).format(date)} ${date.getFullYear()}`;
  }
  if (view === 'week') return getWeekRange(date, locale);
  return date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function navigate(view: CalendarView, date: Date, dir: 1 | -1): Date {
  const d = new Date(date);
  if (view === 'month') d.setMonth(d.getMonth() + dir);
  if (view === 'week')  d.setDate(d.getDate() + dir * 7);
  if (view === 'day')   d.setDate(d.getDate() + dir);
  return d;
}

// ─── Event detail panel ───────────────────────────────────────────────────────

function EventDetailPanel({
  event,
  onClose,
  onLogCompletion,
  locale,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onLogCompletion: (e: CalendarEvent) => void;
  locale: string;
}) {
  const t = useTranslations('calendar.page');
  const colors = ACTIVITY_COLORS[event.type];
  const d = event.details ?? {};
  const done = !!event.completedAt;

  const infoRows: { label: string; value: string }[] = [];
  if (event.block) infoRows.push({ label: 'Block', value: event.block });
  if (d.durationHours) infoRows.push({ label: 'Duration', value: `${d.durationHours} h` });
  if (d.litresPerTree) infoRows.push({ label: 'Rate', value: `${d.litresPerTree} L/tree` });
  if (d.repeatDays)    infoRows.push({ label: 'Repeat every', value: `${d.repeatDays} days` });
  if (d.fertilizerType) infoRows.push({ label: 'Fertilizer', value: d.fertilizerType });
  if (d.amountKgPerTree) infoRows.push({ label: 'Amount', value: `${d.amountKgPerTree} kg/tree` });
  if (d.growthStageNote) infoRows.push({ label: 'Growth stage', value: d.growthStageNote });
  if (d.pesticideType) infoRows.push({ label: 'Product', value: d.pesticideType });
  if (d.amountLPerHa)  infoRows.push({ label: 'Rate', value: `${d.amountLPerHa} L/ha` });
  if (d.pestTarget)    infoRows.push({ label: 'Target', value: d.pestTarget });
  if (d.pruningType)   infoRows.push({ label: 'Pruning type', value: d.pruningType });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 overflow-hidden">
        <div className={`px-6 py-5 ${colors.bg}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className={`mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${colors.text} bg-white/60`}>
                <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
                {ACTIVITY_LABELS[event.type]}
              </span>
              <h2 className={`text-base font-bold leading-snug ${colors.text}`}>{event.title}</h2>
              <p className={`mt-1 text-xs opacity-70 ${colors.text}`}>
                {event.startDate.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}
                {' · '}
                {event.startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {' – '}
                {event.endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <button onClick={onClose}
              className={`rounded-lg p-1 ${colors.text} hover:bg-white/30 transition-colors`}>
              <span className="sr-only">Close</span>
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {infoRows.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              {infoRows.map((row) => (
                <div key={row.label}>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">{row.label}</dt>
                  <dd className="text-sm font-medium text-slate-900 dark:text-white">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {event.notes && (
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">{t('notes')}</p>
              <p className="text-sm text-slate-700 dark:text-slate-300">{event.notes}</p>
            </div>
          )}
          {done && (
            <div className="flex items-center gap-2 rounded-lg bg-brand-50 p-3 ring-1 ring-brand-100 dark:bg-brand-900/20 dark:ring-brand-800">
              <span className="text-brand-600 text-sm font-medium">{t('completed')}</span>
              <span className="text-xs text-slate-500">
                {event.completedAt!.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            </div>
          )}
        </div>

        {!done && (
          <div className="border-t border-slate-200 px-6 py-4 dark:border-slate-700 flex justify-end">
            <button
              onClick={() => { onLogCompletion(event); onClose(); }}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 active:scale-95 transition-all"
            >
              {t('logCompletion')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

const LEGEND_TYPES = ['irrigation', 'fertigation', 'spraying', 'pruning', 'scouting'] as const;

// ─── Main page component ──────────────────────────────────────────────────────

export default function CalendarPage({
  initialEvents = [],
  consumables = [],
  userRole = "worker",
  farmId,
}: {
  initialEvents?: CalendarEvent[];
  consumables?: ConsumableSummary[];
  userRole?: "admin" | "supervisor" | "worker";
  farmId?: string;
}) {
  const locale = useLocale();
  const t = useTranslations('calendar.page');

  const [view, setView]       = useState<CalendarView>('month');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [events, setEvents]   = useState<CalendarEvent[]>(initialEvents);
  const [isPending, startTransition] = useTransition();

  const [showAdd, setShowAdd]                             = useState(false);
  const [addDefaultDate, setAddDefaultDate]               = useState<Date | undefined>();
  const [detailEvent, setDetailEvent]                     = useState<CalendarEvent | null>(null);
  const [completionEvent, setCompletionEvent]             = useState<CalendarEvent | null>(null);

  const label = getLabel(view, currentDate, locale);

  const handlePrev  = useCallback(() => setCurrentDate((d) => navigate(view, d, -1)), [view]);
  const handleNext  = useCallback(() => setCurrentDate((d) => navigate(view, d,  1)), [view]);
  const handleToday = useCallback(() => setCurrentDate(new Date()), []);

  const swipeTouchX = useRef<number | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    swipeTouchX.current = e.touches[0].clientX;
  }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (swipeTouchX.current === null) return;
    const delta = e.changedTouches[0].clientX - swipeTouchX.current;
    swipeTouchX.current = null;
    if (Math.abs(delta) < 50) return;
    if (delta < 0) handleNext();
    else handlePrev();
  }, [handleNext, handlePrev]);

  const handleDayClick = useCallback((date: Date) => {
    if (userRole === "worker") return;
    setAddDefaultDate(date);
    setShowAdd(true);
  }, [userRole]);

  const handleEventClick = useCallback((event: CalendarEvent) => {
    setDetailEvent(event);
  }, []);

  const handleSaveEvent = useCallback((event: CalendarEvent, materials: PlannedMaterial[]) => {
    setEvents((prev) => [...prev, event]);
    startTransition(async () => {
      try {
        const { id: realId } = await createEvent({
          title: event.title,
          type: event.type,
          start_date: event.startDate.toISOString(),
          end_date: event.endDate.toISOString(),
          block: event.block ?? null,
          notes: event.notes ?? null,
          details: event.details ?? null,
        }, materials);
        setEvents((prev) =>
          prev.map((e) => (e.id === event.id ? { ...e, id: realId } : e))
        );
      } catch (err) {
        console.error('[Calendar] Failed to save event:', err);
        setEvents((prev) => prev.filter((e) => e.id !== event.id));
      }
    });
  }, []);

  const handleLogCompletion = useCallback((eventId: string, actualStart: Date, actualEnd: Date, notes: string, materialActuals: MaterialActual[]) => {
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId
          ? { ...e, completedAt: new Date(), notes: notes || e.notes }
          : e
      )
    );
    startTransition(async () => {
      try {
        await logEventCompletion(eventId, actualStart, actualEnd, notes, materialActuals);
      } catch (err) {
        console.error('[Calendar] Failed to log completion:', err);
      }
    });
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* Page title */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('subtitle')}</p>
        </div>
        {isPending && (
          <span className="mt-1 text-xs text-slate-400 dark:text-slate-500 animate-pulse">{t('saving')}</span>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4">
        {LEGEND_TYPES.map((type) => (
          <div key={type} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <span className={`h-2.5 w-2.5 rounded-full ${ACTIVITY_COLORS[type].dot}`} />
            {ACTIVITY_LABELS[type]}
          </div>
        ))}
      </div>

      {/* Header */}
      <CalendarHeader
        view={view}
        onViewChange={setView}
        label={label}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onAddEvent={userRole !== "worker" ? () => { setAddDefaultDate(undefined); setShowAdd(true); } : undefined}
      />

      <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {view === 'month' && (
          <MonthView
            currentDate={currentDate}
            events={events}
            onDayClick={userRole !== "worker" ? handleDayClick : undefined}
            onEventClick={handleEventClick}
          />
        )}
        {view === 'week' && (
          <WeekView
            currentDate={currentDate}
            events={events}
            onEventClick={handleEventClick}
          />
        )}
        {view === 'day' && (
          <DayView
            currentDate={currentDate}
            events={events}
            onEventClick={handleEventClick}
            onLogCompletion={(e) => setCompletionEvent(e)}
          />
        )}
      </div>

      {showAdd && (
        <AddEventModal
          defaultDate={addDefaultDate}
          consumables={consumables}
          onClose={() => setShowAdd(false)}
          onSave={handleSaveEvent}
        />
      )}
      {detailEvent && (
        <EventDetailPanel
          event={detailEvent}
          onClose={() => setDetailEvent(null)}
          onLogCompletion={(e) => { setDetailEvent(null); setCompletionEvent(e); }}
          locale={locale}
        />
      )}
      {completionEvent && (
        <LogCompletionModal
          event={completionEvent}
          onClose={() => setCompletionEvent(null)}
          onComplete={handleLogCompletion}
        />
      )}
    </div>
  );
}
