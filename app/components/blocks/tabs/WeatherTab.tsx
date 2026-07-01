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
    <div className="flex flex-col items-center gap-1.5 min-w-[72px] rounded-xl border border-line bg-surface px-3 py-3">
      <span className="text-xs text-ink-4 font-medium">
        {hour.time.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
      </span>
      <span className="text-xl">{conditionIcon(hour.condition)}</span>
      <span className="text-sm font-bold text-ink">{hour.temp}°</span>
      <span className="text-xs text-ink-4">{hour.humidity}%</span>
      {hour.precip > 0 && <span className="text-xs text-blue">{hour.precip}mm</span>}
    </div>
  );
}

function StatCard({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${alert ? 'border-red/25 bg-red-soft' : 'border-line bg-surface'}`}>
      <p className="text-xs text-ink-3 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${alert ? 'text-red' : 'text-ink'}`}>{value}</p>
      {sub && <p className="text-xs text-ink-4 mt-0.5">{sub}</p>}
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
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-ink-2">Current Conditions</h3>
          <SourceBadge source={data.source} />
        </div>
        <div className="flex items-center gap-4">
          <div>
            <span className={`text-5xl font-bold ${data.heatStressRisk ? 'text-red' : 'text-ink'}`}>
              {data.currentTemp}°C
            </span>
            {data.heatStressRisk && (
              <span className="ml-2 rounded-full bg-red-soft text-red text-xs font-semibold px-2 py-0.5">Heat Stress</span>
            )}
            {data.frostRisk && (
              <span className="ml-2 rounded-full bg-blue-soft text-blue text-xs font-semibold px-2 py-0.5">Frost Risk</span>
            )}
          </div>
        </div>
        <div className="mt-3 flex gap-6 text-sm text-ink-3">
          <span>Humidity <span className="font-semibold text-ink-2">{data.currentHumidity}%</span></span>
          <span>Wind <span className="font-semibold text-ink-2">{data.currentWind} km/h {data.windDirection}</span></span>
          <span>7-day rain <span className="font-semibold text-ink-2">{data.rainfall7d} mm</span></span>
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
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-ink-2">24-Hour Forecast</h3>
          <SourceBadge source="forecast" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {data.forecast.map((h, i) => <ForecastCard key={i} hour={h} />)}
        </div>
      </div>
    </div>
  );
}
