'use client';

import { CalendarEvent, ACTIVITY_COLORS } from './types';
import { useLocale } from 'next-intl';

interface WeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}

// Visible hours: 05:00 – 21:00
const START_HOUR = 5;
const END_HOUR   = 21;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const HOUR_HEIGHT = 64; // px per hour

function getWeekDays(date: Date): Date[] {
  const dow = date.getDay();
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - dow);
  sunday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function topOffset(date: Date): number {
  const hours = date.getHours() + date.getMinutes() / 60 - START_HOUR;
  return Math.max(0, hours * HOUR_HEIGHT);
}

function eventHeight(start: Date, end: Date): number {
  const duration = (end.getTime() - start.getTime()) / 3_600_000;
  return Math.max(24, duration * HOUR_HEIGHT);
}

export default function WeekView({ currentDate, events, onEventClick }: WeekViewProps) {
  const locale = useLocale();
  const DAY_LABELS = [0,1,2,3,4,5,6].map(i =>
    new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 7 + i))
  );
  const days = getWeekDays(currentDate);
  const today = new Date();
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => i + START_HOUR);

  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {/* Day header */}
      <div className="sticky top-0 z-10 grid bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700"
        style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}
      >
        <div className="border-r border-slate-100 dark:border-slate-800" />
        {days.map((day, i) => {
          const isToday = isSameDay(day, today);
          return (
            <div key={i} className="border-r border-slate-100 py-3 text-center last:border-r-0 dark:border-slate-800">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {DAY_LABELS[day.getDay()]}
              </p>
              <p className={`mt-0.5 text-xl font-semibold ${isToday ? 'text-brand-600' : 'text-slate-900 dark:text-white'}`}>
                {day.getDate()}
              </p>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="relative grid" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
        {/* Hour labels + horizontal lines */}
        <div className="col-span-full grid" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
          {hours.map((h) => (
            <div key={h} className="contents">
              <div className="border-r border-slate-100 dark:border-slate-800 pr-2 pt-0.5 text-right"
                style={{ height: HOUR_HEIGHT }}>
                <span className="text-xs text-slate-400 dark:text-slate-500 select-none">
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
              {days.map((_, di) => (
                <div key={di}
                  className="border-r border-b border-slate-100 last:border-r-0 dark:border-slate-800"
                  style={{ height: HOUR_HEIGHT }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Events overlay — one column per day */}
        {days.map((day, di) => {
          const dayEvents = events.filter((e) => isSameDay(e.startDate, day));
          return (
            <div
              key={di}
              className="pointer-events-none absolute"
              style={{
                left: `calc(56px + ${di} * ((100% - 56px) / 7))`,
                width: `calc((100% - 56px) / 7)`,
                top: 0,
                height: TOTAL_HOURS * HOUR_HEIGHT,
              }}
            >
              {dayEvents.map((event) => {
                const top    = topOffset(event.startDate);
                const height = eventHeight(event.startDate, event.endDate);
                const colors = ACTIVITY_COLORS[event.type];
                return (
                  <button
                    key={event.id}
                    onClick={() => onEventClick(event)}
                    style={{ top, height, left: 4, right: 4 }}
                    className={`pointer-events-auto absolute rounded-md px-2 py-1 text-left text-xs font-medium shadow-sm ring-1 ring-inset transition-all hover:opacity-90 active:scale-95 ${colors.bg} ${colors.text} ${colors.ring}`}
                  >
                    <p className="font-semibold leading-tight truncate">{event.title}</p>
                    <p className="mt-0.5 opacity-70">
                      {event.startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {' – '}
                      {event.endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
