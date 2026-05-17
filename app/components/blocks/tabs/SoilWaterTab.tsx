import type { SoilWaterDomain } from '../types';
import AlertBadge from '../AlertBadge';
import SourceBadge from '../SourceBadge';

interface Props {
  data: SoilWaterDomain;
}

function MoistureBar({ value, field, wilting }: { value: number; field: number; wilting: number }) {
  const pct = Math.min(100, (value / field) * 100);
  const wiltPct = (wilting / field) * 100;
  const color =
    value < wilting ? 'bg-red-500' :
    value < wilting + 5 ? 'bg-amber-400' :
    'bg-brand-500';

  return (
    <div className="mt-1 flex flex-col gap-1">
      <div className="relative h-4 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
        {/* Wilting point marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-red-400 opacity-70"
          style={{ left: `${wiltPct}%` }}
          title="Wilting point"
        />
      </div>
      <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500">
        <span>0%</span>
        <span className="text-red-400">Wilting {wilting}%</span>
        <span>Field cap. {field}%</span>
      </div>
    </div>
  );
}

function MetricRow({ label, value, unit, source }: { label: string; value: string | number; unit?: string; source?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-900 dark:text-white">
          {value}{unit && <span className="font-normal text-slate-400 ml-0.5">{unit}</span>}
        </span>
        {source && (
          <span className="rounded-full px-1.5 py-0.5 text-xs bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 capitalize">
            {source}
          </span>
        )}
      </div>
    </div>
  );
}

export default function SoilWaterTab({ data }: Props) {
  const moistureStatus =
    data.soilMoisture < data.wiltingPoint ? 'text-red-600' :
    data.soilMoisture < data.wiltingPoint + 5 ? 'text-amber-600' :
    'text-brand-600';

  return (
    <div className="flex flex-col gap-6">
      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="flex flex-col gap-2">
          {data.alerts.map(a => (
            <AlertBadge key={a.id} severity={a.severity} message={a.message} source={a.source} timestamp={a.timestamp} />
          ))}
        </div>
      )}

      {/* Soil moisture hero */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Soil Moisture</h3>
          <SourceBadge source={data.source} />
        </div>
        <div className="flex items-end gap-2">
          <span className={`text-4xl font-bold ${moistureStatus}`}>{data.soilMoisture}</span>
          <span className="text-lg text-slate-400 pb-1">% vol</span>
        </div>
        <MoistureBar value={data.soilMoisture} field={data.fieldCapacity} wilting={data.wiltingPoint} />
      </div>

      {/* Grid of sensor metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 mb-1">Soil EC</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{data.soilEC} <span className="text-sm font-normal text-slate-400">dS/m</span></p>
          <p className="text-xs text-slate-400 mt-1">Normal range: 0.8–2.0</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 mb-1">Root Zone Temp</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{data.rootZoneTemp} <span className="text-sm font-normal text-slate-400">°C</span></p>
          <p className="text-xs text-slate-400 mt-1">Sensor</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 mb-1">ETo (daily)</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{data.eto} <span className="text-sm font-normal text-slate-400">mm/day</span></p>
          <p className="text-xs text-teal-500 mt-1">Computed</p>
        </div>
        <div className={`rounded-xl border p-4 ${data.waterDeficit > 40 ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'}`}>
          <p className="text-xs text-slate-500 mb-1">Water Deficit</p>
          <p className={`text-2xl font-bold ${data.waterDeficit > 40 ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}>
            {data.waterDeficit} <span className="text-sm font-normal text-slate-400">mm</span>
          </p>
          <p className="text-xs text-teal-500 mt-1">Computed</p>
        </div>
      </div>

      {/* Irrigation schedule */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Irrigation Schedule</h3>
        </div>
        <div className="px-4 divide-y divide-slate-100 dark:divide-slate-800">
          <MetricRow
            label="Last Irrigation"
            value={data.lastIrrigation.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            source="manual"
          />
          <MetricRow
            label="Next Irrigation Due"
            value={data.nextIrrigationDue.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            source="calendar"
          />
        </div>
      </div>
    </div>
  );
}
