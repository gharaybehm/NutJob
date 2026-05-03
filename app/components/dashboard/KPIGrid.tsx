import { Droplets, CloudRain, AlertTriangle, Timer } from "lucide-react";

const kpis = [
  {
    name: "Avg Soil Moisture",
    value: "28%",
    change: "-2%",
    changeType: "negative",
    icon: Droplets,
    color: "text-blue-500",
    bg: "bg-blue-100 dark:bg-blue-900/30",
  },
  {
    name: "7-Day Rain Forecast",
    value: "12 mm",
    change: "+4 mm",
    changeType: "positive",
    icon: CloudRain,
    color: "text-brand-500",
    bg: "bg-brand-100 dark:bg-brand-900/30",
  },
  {
    name: "Active Alerts",
    value: "3",
    change: "+1",
    changeType: "negative",
    icon: AlertTriangle,
    color: "text-red-500",
    bg: "bg-red-100 dark:bg-red-900/30",
  },
  {
    name: "Next Irrigation",
    value: "In 14h",
    change: "Block B, C",
    changeType: "neutral",
    icon: Timer,
    color: "text-amber-500",
    bg: "bg-amber-100 dark:bg-amber-900/30",
  },
];

export default function KPIGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <div
          key={kpi.name}
          className="relative overflow-hidden rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
        >
          <dt>
            <div className={`absolute rounded-lg p-3 ${kpi.bg}`}>
              <kpi.icon className={`h-6 w-6 ${kpi.color}`} aria-hidden="true" />
            </div>
            <p className="ml-16 truncate text-sm font-medium text-slate-500 dark:text-slate-400">
              {kpi.name}
            </p>
          </dt>
          <dd className="ml-16 flex items-baseline pb-1 sm:pb-2">
            <p className="text-2xl font-semibold text-slate-900 dark:text-white">
              {kpi.value}
            </p>
            <p
              className={`ml-2 flex items-baseline text-sm font-semibold ${
                kpi.changeType === "positive"
                  ? "text-brand-600 dark:text-brand-400"
                  : kpi.changeType === "negative"
                  ? "text-red-600 dark:text-red-400"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {kpi.change}
            </p>
          </dd>
        </div>
      ))}
    </div>
  );
}
