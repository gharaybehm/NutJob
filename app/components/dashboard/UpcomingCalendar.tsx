import { Calendar, Droplet, ThermometerSun, Bug, Sprout } from "lucide-react";
import Link from "next/link";

interface CalendarEventItem {
  id: string;
  title: string;
  startDate: string;
  type: string;
}

interface UpcomingCalendarProps {
  events: CalendarEventItem[];
}

function getEventIcon(type: string) {
  if (type === 'irrigation') return Droplet;
  if (type === 'fertigation') return ThermometerSun;
  if (type === 'spraying' || type === 'scouting') return Bug;
  return Sprout;
}

function getEventTheme(type: string) {
  if (type === 'irrigation') return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30';
  if (type === 'fertigation') return 'bg-brand-100 text-brand-600 dark:bg-brand-900/30';
  if (type === 'spraying') return 'bg-red-100 text-red-600 dark:bg-red-900/30';
  if (type === 'scouting') return 'bg-amber-100 text-amber-600 dark:bg-amber-900/30';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

function formatEventTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const diffTime = dateDay.getTime() - nowDay.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  
  if (diffDays === 0) {
    return `Today, ${timeString}`;
  } else if (diffDays === 1) {
    return `Tomorrow, ${timeString}`;
  } else if (diffDays === -1) {
    return `Yesterday, ${timeString}`;
  } else {
    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date);
    const day = new Intl.DateTimeFormat('en-US', { day: 'numeric' }).format(date);
    const month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
    return `${weekday} ${day} ${month}, ${timeString}`;
  }
}

export default function UpcomingCalendar({ events = [] }: UpcomingCalendarProps) {
  const count = events.length;

  return (
    <div className="flex flex-col rounded-xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Upcoming Events</h2>
        <Calendar className="h-5 w-5 text-slate-400" />
      </div>
      <div className="p-4">
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center gap-1 text-slate-400 dark:text-slate-500">
            <Calendar className="h-8 w-8 stroke-1" />
            <p className="text-sm font-medium">No upcoming tasks scheduled</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {events.slice(0, 3).map((event) => {
              const Icon = getEventIcon(event.type);
              const theme = getEventTheme(event.type);
              
              return (
                <li key={event.id} className="flex items-center gap-4 rounded-lg p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${theme}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{event.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatEventTime(event.startDate)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Link 
          href="/calendar" 
          className="block mt-4 w-full text-center rounded-md bg-slate-50 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
        >
          View Full Calendar
        </Link>
      </div>
    </div>
  );
}
