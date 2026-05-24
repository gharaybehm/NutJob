import { AlertCircle, AlertTriangle, Info, CheckCircle } from "lucide-react";

interface AlertItem {
  id: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  created_at: string;
  domain: 'soil-water' | 'phenology' | 'nutrition' | 'pest-disease' | 'weather';
  blockName: string | null;
}

interface ActiveAlertsProps {
  alerts: AlertItem[];
}

function getAlertIcon(severity: string) {
  if (severity === 'critical') return AlertCircle;
  if (severity === 'warning') return AlertTriangle;
  return Info;
}

function getDomainLabel(domain: string) {
  switch (domain) {
    case 'soil-water': return "Soil & Water";
    case 'phenology': return "Phenology";
    case 'nutrition': return "Nutrition";
    case 'pest-disease': return "Pest & Disease";
    case 'weather': return "Weather Alert";
    default: return "System Alert";
  }
}

function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMins / 60);
  
  if (diffHrs >= 24) {
    const days = Math.floor(diffHrs / 24);
    return days === 1 ? "Yesterday" : `${days} days ago`;
  }
  if (diffHrs > 0) {
    return `${diffHrs} hour${diffHrs > 1 ? 's' : ''} ago`;
  }
  if (diffMins > 0) {
    return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  }
  return "Just now";
}

export default function ActiveAlerts({ alerts = [] }: ActiveAlertsProps) {
  const count = alerts.length;

  return (
    <div className="flex h-full flex-col rounded-xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Active Alerts</h2>
        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
          count > 0 
            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' 
            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400'
        }`}>
          {count > 0 ? `${count} Active` : "Clear"}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 min-h-[200px]">
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-10 text-center gap-2">
            <CheckCircle className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">All systems nominal</p>
            <p className="text-xs text-slate-500 max-w-[280px]">
              No active alerts detected. Orchard parameters are within healthy thresholds.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {alerts.map((alert) => {
              const Icon = getAlertIcon(alert.severity);
              const isCritical = alert.severity === 'critical';
              const blockStr = alert.blockName ? ` • ${alert.blockName}` : "";

              return (
                <li key={alert.id} className={`rounded-lg border p-4 ${
                  isCritical 
                    ? 'border-red-200 bg-red-50/50 dark:border-red-900/30 dark:bg-red-950/10' 
                    : alert.severity === 'warning'
                    ? 'border-amber-200 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/10'
                    : 'border-slate-200 bg-slate-50/50 dark:border-slate-800/30 dark:bg-slate-900/10'
                }`}>
                  <div className="flex items-start gap-3">
                    <Icon className={`h-5 w-5 mt-0.5 ${
                      isCritical 
                        ? 'text-red-600 dark:text-red-500' 
                        : alert.severity === 'warning'
                        ? 'text-amber-600 dark:text-amber-500'
                        : 'text-blue-500 dark:text-blue-400'
                    }`} />
                    <div className="flex-1">
                      <h3 className={`text-sm font-semibold ${
                        isCritical 
                          ? 'text-red-800 dark:text-red-300' 
                          : alert.severity === 'warning'
                          ? 'text-amber-800 dark:text-amber-300'
                          : 'text-slate-800 dark:text-slate-300'
                      }`}>
                        {getDomainLabel(alert.domain)}{blockStr}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        {alert.message}
                      </p>
                      <p className="mt-2 text-xs text-slate-400">
                        {formatRelativeTime(alert.created_at)}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
