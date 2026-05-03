import { Calendar, Droplet, ThermometerSun, Bug } from "lucide-react";

const events = [
  {
    id: 1,
    title: "Irrigation Run - Block C",
    time: "Today, 18:00",
    type: "irrigation",
    icon: Droplet,
  },
  {
    id: 2,
    title: "Fertigation (Nitrogen)",
    time: "Tomorrow, 06:00",
    type: "fertigation",
    icon: ThermometerSun,
  },
  {
    id: 3,
    title: "Orchard Scouting",
    time: "Wed 14 May, 08:00",
    type: "scouting",
    icon: Bug,
  },
];

export default function UpcomingCalendar() {
  return (
    <div className="flex flex-col rounded-xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Upcoming</h2>
        <Calendar className="h-5 w-5 text-slate-400" />
      </div>
      <div className="p-4">
        <ul className="space-y-3">
          {events.map((event) => (
            <li key={event.id} className="flex items-center gap-4 rounded-lg p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                event.type === 'irrigation' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30' :
                event.type === 'fertigation' ? 'bg-brand-100 text-brand-600 dark:bg-brand-900/30' :
                'bg-amber-100 text-amber-600 dark:bg-amber-900/30'
              }`}>
                <event.icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white">{event.title}</p>
                <p className="text-xs text-slate-500">{event.time}</p>
              </div>
            </li>
          ))}
        </ul>
        <button className="mt-4 w-full rounded-md bg-slate-50 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors">
          View Full Calendar
        </button>
      </div>
    </div>
  );
}
