'use client';

import { CalendarEvent } from './types';
import EventPill from './EventPill';
import { useLocale } from 'next-intl';

interface MonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onDayClick?: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export default function MonthView({ currentDate, events, onDayClick, onEventClick }: MonthViewProps) {
  const locale = useLocale();
  // Jan 7–13, 2024 = Sun–Sat reference week; Intl handles abbreviation for every locale
  const DAY_NAMES = [0,1,2,3,4,5,6].map(i =>
    new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 7 + i))
  );

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Build the grid: fill with days from prev/curr/next month
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay(); // 0 = Sun

  const cells: Date[] = [];
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push(new Date(year, month, -i));
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push(new Date(year, month, d));
  }
  while (cells.length % 7 !== 0) {
    cells.push(new Date(year, month + 1, cells.length - lastDay.getDate() - startOffset + 1));
  }

  const today = new Date();

  const eventsOnDay = (day: Date) =>
    events.filter((e) => isSameDay(e.startDate, day));

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      {/* Day header row */}
      <div className="grid grid-cols-7 border-b border-line">
        {DAY_NAMES.map((d) => (
          <div
            key={d}
            className="py-3 text-center font-mono text-[10px] font-semibold uppercase tracking-wide text-ink-3"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid flex-1 grid-cols-7" style={{ gridAutoRows: '1fr' }}>
        {cells.map((day, idx) => {
          const isCurrentMonth = day.getMonth() === month;
          const isToday = isSameDay(day, today);
          const dayEvents = eventsOnDay(day);
          const MAX_PILLS = 3;
          const overflow = dayEvents.length - MAX_PILLS;

          return (
            <div
              key={idx}
              onClick={() => onDayClick?.(day)}
              className={`group min-h-[110px] border-r border-b border-line-soft p-1.5 transition-colors last:border-r-0 ${
                onDayClick
                  ? 'cursor-pointer hover:bg-tile'
                  : 'cursor-default'
              } ${
                !isCurrentMonth ? 'bg-tile/50' : isToday ? 'bg-green-soft/60' : ''
              }`}
            >
              {/* Day number */}
              <div className="mb-1 flex items-center justify-between px-0.5">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full font-heading text-sm font-medium transition-colors ${
                    isToday
                      ? 'bg-green text-white font-bold'
                      : isCurrentMonth
                        ? 'text-ink group-hover:text-green'
                        : 'text-ink-4'
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>

              {/* Event pills */}
              <div className="space-y-0.5">
                {dayEvents.slice(0, MAX_PILLS).map((event) => (
                  <EventPill
                    key={event.id}
                    title={event.title}
                    type={event.type}
                    compact
                    onClick={(e) => { e?.stopPropagation?.(); onEventClick(event); }}
                  />
                ))}
                {overflow > 0 && (
                  <p className="ps-1 text-xs text-ink-3">
                    +{overflow}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
