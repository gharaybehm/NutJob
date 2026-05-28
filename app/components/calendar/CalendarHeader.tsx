'use client';

import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';

export type CalendarView = 'month' | 'week' | 'day';

interface CalendarHeaderProps {
  view: CalendarView;
  onViewChange: (v: CalendarView) => void;
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onAddEvent?: () => void;
}

const VIEWS: { key: CalendarView; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: 'week',  label: 'Week'  },
  { key: 'day',   label: 'Day'   },
];

export default function CalendarHeader({
  view,
  onViewChange,
  label,
  onPrev,
  onNext,
  onToday,
  onAddEvent,
}: CalendarHeaderProps) {
  return (
    <div className="mb-3 md:mb-6 flex flex-wrap items-center justify-between gap-2 md:gap-3">
      {/* Left: nav */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToday}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 active:scale-95 transition-all dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Today
        </button>
        <div className="flex items-center rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
          <button
            onClick={onPrev}
            className="flex h-11 w-11 md:h-8 md:w-8 items-center justify-center bg-white hover:bg-slate-50 text-slate-600 transition-colors dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300"
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={onNext}
            className="flex h-11 w-11 md:h-8 md:w-8 items-center justify-center bg-white hover:bg-slate-50 text-slate-600 transition-colors border-l border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700"
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{label}</h1>
      </div>

      {/* Right: view toggle + add */}
      <div className="flex items-center gap-3">
        {/* Segmented control */}
        <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => onViewChange(v.key)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-all ${
                view === v.key
                  ? 'bg-white shadow-sm text-slate-900 dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Add event */}
        {onAddEvent && (
          <button
            id="add-event-btn"
            onClick={onAddEvent}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 active:scale-95 transition-all"
          >
            <Plus className="h-4 w-4" />
            Add Event
          </button>
        )}
      </div>
    </div>
  );
}
