'use client';

import { CalendarEvent, ACTIVITY_COLORS, ACTIVITY_LABELS } from './types';
import { CheckCircle, Clock, MapPin, ClipboardList } from 'lucide-react';

interface DayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onLogCompletion: (event: CalendarEvent) => void;
}

// Visible hours: 05:00 – 21:00
const START_HOUR = 5;
const END_HOUR   = 21;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const HOUR_HEIGHT = 72; // px

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function fmt(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function DayView({ currentDate, events, onEventClick, onLogCompletion }: DayViewProps) {
  const dayEvents = events.filter((e) => isSameDay(e.startDate, currentDate));
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => i + START_HOUR);

  const today = new Date();
  const isToday = isSameDay(currentDate, today);
  const dateLabel = currentDate.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-700 dark:bg-slate-900">
        <p className={`text-lg font-semibold ${isToday ? 'text-brand-600' : 'text-slate-900 dark:text-white'}`}>
          {isToday ? 'Today — ' : ''}{dateLabel}
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {dayEvents.length === 0
            ? 'No events scheduled'
            : `${dayEvents.length} event${dayEvents.length > 1 ? 's' : ''} scheduled`}
        </p>
      </div>

      {/* Time grid */}
      <div className="relative flex" style={{ minHeight: TOTAL_HOURS * HOUR_HEIGHT }}>
        {/* Hour column */}
        <div className="w-16 shrink-0">
          {hours.map((h) => (
            <div key={h} className="flex items-start justify-end border-b border-slate-100 pr-3 dark:border-slate-800"
              style={{ height: HOUR_HEIGHT }}>
              <span className="pt-0.5 text-xs text-slate-400 dark:text-slate-500 select-none">
                {String(h).padStart(2, '0')}:00
              </span>
            </div>
          ))}
        </div>

        {/* Event area */}
        <div className="relative flex-1 border-l border-slate-100 dark:border-slate-800">
          {hours.map((h) => (
            <div key={h} className="border-b border-slate-100 dark:border-slate-800"
              style={{ height: HOUR_HEIGHT }} />
          ))}

          {/* Events as cards */}
          {dayEvents.map((event) => {
            const startH = event.startDate.getHours() + event.startDate.getMinutes() / 60 - START_HOUR;
            const duration = (event.endDate.getTime() - event.startDate.getTime()) / 3_600_000;
            const top    = Math.max(0, startH * HOUR_HEIGHT);
            const height = Math.max(48, duration * HOUR_HEIGHT);
            const colors = ACTIVITY_COLORS[event.type];
            const done   = !!event.completedAt;

            return (
              <div
                key={event.id}
                style={{ top, height, left: 8, right: 8 }}
                className={`absolute rounded-lg px-3 py-2 shadow-sm ring-1 ring-inset ${colors.bg} ${colors.ring} ${done ? 'opacity-60' : ''}`}
              >
                {/* Type badge */}
                <span className={`mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${colors.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
                  {ACTIVITY_LABELS[event.type]}
                </span>

                <p className={`text-sm font-semibold ${colors.text} leading-snug`}>{event.title}</p>

                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span className="flex items-center gap-1 text-xs opacity-70">
                    <Clock className="h-3 w-3" />
                    {fmt(event.startDate)} – {fmt(event.endDate)}
                  </span>
                  {event.block && (
                    <span className="flex items-center gap-1 text-xs opacity-70">
                      <MapPin className="h-3 w-3" />
                      {event.block}
                    </span>
                  )}
                </div>

                {event.notes && height > 80 && (
                  <p className="mt-1 text-xs opacity-60 line-clamp-2">{event.notes}</p>
                )}

                {/* Actions */}
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => onEventClick(event)}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all hover:opacity-80 active:scale-95 ${colors.text} bg-white/50 ring-1 ring-inset ${colors.ring}`}
                  >
                    <ClipboardList className="h-3 w-3" />
                    Details
                  </button>
                  {!done && (
                    <button
                      onClick={() => onLogCompletion(event)}
                      className="flex items-center gap-1 rounded-md bg-white/70 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200 transition-all hover:bg-white active:scale-95"
                    >
                      <CheckCircle className="h-3 w-3 text-brand-600" />
                      Log Completion
                    </button>
                  )}
                  {done && (
                    <span className="flex items-center gap-1 text-xs font-medium text-brand-600">
                      <CheckCircle className="h-3 w-3" />
                      Completed
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
