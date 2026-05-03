import { AlertCircle, AlertTriangle, Info } from "lucide-react";

const alerts = [
  {
    id: 1,
    title: "Critical Soil Moisture",
    description: "Block C moisture level dropped below 15% threshold. Immediate irrigation recommended.",
    severity: "red",
    time: "2 hours ago",
    icon: AlertCircle,
  },
  {
    id: 2,
    title: "Pest Risk Elevated",
    description: "High humidity and temperature in Block A increases risk of Navel Orangeworm. Scouting recommended.",
    severity: "amber",
    time: "5 hours ago",
    icon: AlertTriangle,
  },
  {
    id: 3,
    title: "Frost Warning",
    description: "Temperatures expected to drop near freezing point in lower elevation blocks tonight.",
    severity: "amber",
    time: "12 hours ago",
    icon: AlertTriangle,
  },
];

export default function ActiveAlerts() {
  return (
    <div className="flex h-full flex-col rounded-xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Active Alerts</h2>
        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
          3 New
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-4">
          {alerts.map((alert) => (
            <li key={alert.id} className={`rounded-lg border p-4 ${
              alert.severity === 'red' 
                ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/10' 
                : 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/10'
            }`}>
              <div className="flex items-start gap-3">
                <alert.icon className={`h-5 w-5 mt-0.5 ${
                  alert.severity === 'red' ? 'text-red-600 dark:text-red-500' : 'text-amber-600 dark:text-amber-500'
                }`} />
                <div className="flex-1">
                  <h3 className={`text-sm font-medium ${
                    alert.severity === 'red' ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'
                  }`}>
                    {alert.title}
                  </h3>
                  <p className={`mt-1 text-sm ${
                    alert.severity === 'red' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'
                  }`}>
                    {alert.description}
                  </p>
                  <p className={`mt-2 text-xs ${
                    alert.severity === 'red' ? 'text-red-500' : 'text-amber-500'
                  }`}>
                    {alert.time}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
