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
  const markerColor = status === 'green' ? 'bg-green' : status === 'amber' ? 'bg-amber' : 'bg-red';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-ink w-6">{element}</span>
          <span className="text-xs text-ink-3">{value} {unit}</span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          status === 'green' ? 'bg-green-soft text-green' :
          status === 'amber' ? 'bg-amber-soft text-amber' : 'bg-red-soft text-red'
        }`}>
          {status === 'green' ? 'Optimal' : status === 'amber' ? 'Low' : 'Deficient'}
        </span>
      </div>
      <div className="relative h-3 w-full rounded-full bg-tile overflow-hidden">
        <div className="absolute h-full bg-green-soft" style={{ left: `${optLowPct}%`, width: `${optHighPct - optLowPct}%` }} />
        <div className={`absolute top-0.5 bottom-0.5 w-2 rounded-full ${markerColor}`} style={{ left: `${Math.max(0, valuePct - 1)}%` }} />
      </div>
      <div className="flex justify-between text-xs text-ink-4">
        <span>Low &lt;{low}</span>
        <span className="text-green">Optimal {optLow}–{optHigh}</span>
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

      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-ink-2">Leaf Tissue Analysis</h3>
          <div className="flex items-center gap-2">
            <SourceBadge source={data.source} />
            <span className="text-xs text-ink-4">
              {data.tissueSampleDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-5">
          {data.nutrients.map(n => <NutrientGauge key={n.element} nutrient={n} />)}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold text-ink-2 mb-3">Last Fertigation</h3>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-3">Date</span>
            <span className="text-sm font-medium text-ink">
              {data.lastFertigation.date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-3">Product</span>
            <span className="text-sm font-medium text-ink">{data.lastFertigation.fertilizerType}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-3">Rate</span>
            <span className="text-sm font-medium text-ink">{data.lastFertigation.amountKgPerTree} kg/tree</span>
          </div>
          {data.lastFertigation.notes && (
            <div className="mt-1 rounded-lg bg-tile px-3 py-2 text-xs text-ink-3">
              {data.lastFertigation.notes}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gold/30 bg-gold-soft p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-ink-2">Next Fertigation</p>
            <p className="text-xs text-ink-3 mt-0.5">Scheduled from calendar</p>
          </div>
          <span className="text-sm font-bold text-gold">
            {data.nextFertigation.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
          </span>
        </div>
      </div>
    </div>
  );
}
