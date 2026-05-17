import type { WeatherDomain, WeatherHour } from '../types';
import AlertBadge from '../AlertBadge';
import SourceBadge from '../SourceBadge';

interface Props { data: WeatherDomain; }

function conditionIcon(condition: string): string {
  if (condition.includes('Rain')) return '🌧';
  if (condition.includes('Cloud')) return '⛅';
  if (condition.includes('Clear') || condition.includes('Sunny')) return '☀️';
  return '🌤';
}

function ForecastCard({ hour }: { hour: WeatherHour }) {
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-[72px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-3">
      <span className="text-xs text-slate-400 font-medium">
        {hour.time.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
      </span>
      <span className="text-xl">{conditionIcon(hour.condition)}</span>
      <span className="text-sm font-bold text-slate-900 dark:text-white">{hour.temp}°</span>
      <span className="text-xs text-slate-400">{hour.humidity}%</span>
      {hour.precip > 0 && <span className="text-xs text-blue-500">{hour.precip}mm</span>}
    </div>
  );
}

function StatCard({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${alert ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${alert ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function WeatherTab({ data }: Props) {
  return (
    <div className="flex flex-col gap-6">
      {data.alerts.length > 0 && (
        <div className="flex flex-col gap-2">
          {data.alerts.map(a => (
            <AlertBadge key={a.id} severity={a.severity} message={a.message} source={a.source} timestamp={a.timestamp} />
          ))}
        </div>
      )}

      {/* Current conditions */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Current Conditions</h3>
          <SourceBadge source={data.source} />
        </div>
        <div className="flex items-center gap-4">
          <div>
            <span className={`text-5xl font-bold ${data.heatStressRisk ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>
              {data.currentTemp}°C
            </span>
            {data.heatStressRisk && (
              <span className="ml-2 rounded-full bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5">Heat Stress</span>
            )}
            {data.frostRisk && (
              <span className="ml-2 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5">Frost Risk</span>
            )}
          </div>
        </div>
        <div className="mt-3 flex gap-6 text-sm text-slate-500">
          <span>Humidity <span className="font-semibold text-slate-800 dark:text-slate-200">{data.currentHumidity}%</span></span>
          <span>Wind <span className="font-semibold text-slate-800 dark:text-slate-200">{data.currentWind} km/h {data.windDirection}</span></span>
          <span>7-day rain <span className="font-semibold text-slate-800 dark:text-slate-200">{data.rainfall7d} mm</span></span>
        </div>
      </div>

      {/* Risk flags */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Heat Stress Risk" value={data.heatStressRisk ? 'Active' : 'None'} sub="Temp > 38°C" alert={data.heatStressRisk} />
        <StatCard label="Frost Risk" value={data.frostRisk ? 'Active' : 'None'} sub="Temp < 2°C" alert={data.frostRisk} />
        <StatCard label="Wind Speed" value={`${data.currentWind} km/h`} sub={data.windDirection} />
        <StatCard label="7-day Rainfall" value={`${data.rainfall7d} mm`} sub="Block sensor" />
      </div>

      {/* Forecast strip */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">24-Hour Forecast</h3>
          <SourceBadge source="forecast" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {data.forecast.map((h, i) => <ForecastCard key={i} hour={h} />)}
        </div>
      </div>
    </div>
  );
}
