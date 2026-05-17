import type { NutritionDomain, NutrientLevel } from '../types';
import AlertBadge from '../AlertBadge';
import SourceBadge from '../SourceBadge';

interface Props {
  data: NutritionDomain;
}

function NutrientGauge({ nutrient }: { nutrient: NutrientLevel }) {
  const { value, low, optimal, high, element, unit, status } = nutrient;
  const [optLow, optHigh] = optimal;
  const scale = high * 1.2;
  const valuePct = Math.min(100, (value / scale) * 100);
  const optLowPct = (optLow / scale) * 100;
  const optHighPct = (optHigh / scale) * 100;
  const markerColor = status === 'green' ? 'bg-brand-600' : status === 'amber' ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-900 dark:text-white w-6">{element}</span>
          <span className="text-xs text-slate-500">{value} {unit}</span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          status === 'green' ? 'bg-brand-100 text-brand-700' :
          status === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
        }`}>
          {status === 'green' ? 'Optimal' : status === 'amber' ? 'Low' : 'Deficient'}
        </span>
      </div>
      <div className="relative h-3 w-full rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div className="absolute h-full bg-brand-100 dark:bg-brand-900/30" style={{ left: `${optLowPct}%`, width: `${optHighPct - optLowPct}%` }} />
        <div className={`absolute top-0.5 bottom-0.5 w-2 rounded-full ${markerColor}`} style={{ left: `${Math.max(0, valuePct - 1)}%` }} />
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>Low &lt;{low}</span>
        <span className="text-brand-600">Optimal {optLow}–{optHigh}</span>
        <span>High &gt;{high}</span>
      </div>
    </div>
  );
}

export default function NutritionTab({ data }: Props) {
  return (
    <div className="flex flex-col gap-6">
      {data.alerts.length > 0 && (
        <div className="flex flex-col gap-2">
          {data.alerts.map(a => (
            <AlertBadge key={a.id} severity={a.severity} message={a.message} source={a.source} timestamp={a.timestamp} />
          ))}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Leaf Tissue Analysis</h3>
          <div className="flex items-center gap-2">
            <SourceBadge source={data.source} />
            <span className="text-xs text-slate-400">
              {data.tissueSampleDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-5">
          {data.nutrients.map(n => <NutrientGauge key={n.element} nutrient={n} />)}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Last Fertigation</h3>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Date</span>
            <span className="text-sm font-medium text-slate-900 dark:text-white">
              {data.lastFertigation.date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Product</span>
            <span className="text-sm font-medium text-slate-900 dark:text-white">{data.lastFertigation.fertilizerType}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Rate</span>
            <span className="text-sm font-medium text-slate-900 dark:text-white">{data.lastFertigation.amountKgPerTree} kg/tree</span>
          </div>
          {data.lastFertigation.notes && (
            <div className="mt-1 rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-500">
              {data.lastFertigation.notes}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-brand-200 dark:border-brand-800/50 bg-brand-50/40 dark:bg-brand-950/20 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Next Fertigation</p>
            <p className="text-xs text-slate-500 mt-0.5">Scheduled from calendar</p>
          </div>
          <span className="text-sm font-bold text-brand-700 dark:text-brand-400">
            {data.nextFertigation.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
          </span>
        </div>
      </div>
    </div>
  );
}
