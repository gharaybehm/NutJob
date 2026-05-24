import { Droplets, CloudRain, AlertTriangle, Timer } from "lucide-react";

interface KPIGridProps {
  avgSoilMoisture: number | null;
  rainForecastMm: number;
  activeAlertsCount: number;
  nextIrrigationStr: string;
}

export default function KPIGrid({
  avgSoilMoisture,
  rainForecastMm,
  activeAlertsCount,
  nextIrrigationStr,
}: KPIGridProps) {
  const kpis = [
    {
      name: "Avg Soil Moisture",
      value: avgSoilMoisture !== null ? `${avgSoilMoisture}%` : "N/A",
      change: "Live sensor average",
      changeType: "neutral",
      icon: Droplets,
      color: "text-blue-500",
      bg: "bg-blue-100 dark:bg-blue-900/30",
    },
    {
      name: "7-Day Rain Forecast",
      value: `${rainForecastMm} mm`,
      change: "Expected total",
      changeType: rainForecastMm > 0 ? "positive" : "neutral",
      icon: CloudRain,
      color: "text-brand-500",
      bg: "bg-brand-100 dark:bg-brand-900/30",
    },
    {
      name: "Active Alerts",
      value: String(activeAlertsCount),
      change: activeAlertsCount > 0 ? `${activeAlertsCount} unresolved` : "All systems nominal",
      changeType: activeAlertsCount > 0 ? "negative" : "positive",
      icon: AlertTriangle,
      color: activeAlertsCount > 0 ? "text-red-500" : "text-slate-400",
      bg: activeAlertsCount > 0 ? "bg-red-100 dark:bg-red-900/30" : "bg-slate-100 dark:bg-slate-800/30",
    },
    {
      name: "Next Irrigation",
      value: nextIrrigationStr,
      change: "Scheduled queue",
      changeType: "neutral",
      icon: Timer,
      color: "text-amber-500",
      bg: "bg-amber-100 dark:bg-amber-900/30",
    },
  ];

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
