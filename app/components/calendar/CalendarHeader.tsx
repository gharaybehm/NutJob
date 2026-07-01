'use client';

import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

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

export default function CalendarHeader({
  view,
  onViewChange,
  label,
  onPrev,
  onNext,
  onToday,
  onAddEvent,
}: CalendarHeaderProps) {
  const t = useTranslations('calendar.header');

  const VIEWS: { key: CalendarView; label: string }[] = [
    { key: 'month', label: t('month') },
    { key: 'week',  label: t('week')  },
    { key: 'day',   label: t('day')   },
  ];

  return (
    <div className="mb-3 md:mb-6 flex flex-wrap items-center justify-between gap-2 md:gap-3">
      {/* Left: nav */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToday}
          className="rounded-[11px] border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-ink hover:border-ink-4 transition-all"
        >
          {t('today')}
        </button>
        <div className="flex items-center rounded-[11px] border border-line overflow-hidden">
          <button
            onClick={onPrev}
            className="flex h-11 w-11 md:h-8 md:w-8 items-center justify-center bg-surface hover:bg-tile text-ink-2 transition-colors"
            aria-label={t('previous')}
          >
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          </button>
          <button
            onClick={onNext}
            className="flex h-11 w-11 md:h-8 md:w-8 items-center justify-center bg-surface hover:bg-tile text-ink-2 transition-colors border-s border-line"
            aria-label={t('next')}
          >
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </button>
        </div>
        <h1 className="font-heading text-lg font-bold text-ink">{label}</h1>
      </div>

      {/* Right: view toggle + add */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-[9px] border border-line bg-tile-2 p-[3px]">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => onViewChange(v.key)}
              className={`rounded-[7px] px-3.5 py-1.5 text-sm font-semibold transition-all ${
                view === v.key
                  ? 'bg-surface shadow-sm text-ink'
                  : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {onAddEvent && (
          <button
            id="add-event-btn"
            onClick={onAddEvent}
            className="flex items-center gap-2 rounded-[11px] bg-gradient-to-b from-[#37905C] to-green px-4 py-2 text-sm font-semibold text-white shadow-[0_6px_16px_-4px_rgba(47,125,79,.5)] hover:brightness-105 transition-all"
          >
            <Plus className="h-4 w-4" />
            {t('addEvent')}
          </button>
        )}
      </div>
    </div>
  );
}
