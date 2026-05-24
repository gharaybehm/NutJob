import type { PhenologyDomain, GrowthStage } from '../types';
import AlertBadge from '../AlertBadge';
import SourceBadge from '../SourceBadge';

interface Props {
  data: PhenologyDomain;
}

const STAGES: { key: GrowthStage; label: string; icon: string }[] = [
  { key: 'dormancy',       label: 'Dormancy',       icon: '❄️' },
  { key: 'bud-swell',     label: 'Bud Swell',      icon: '🌱' },
  { key: 'bud-break',     label: 'Bud Break',      icon: '🌿' },
  { key: 'bloom',         label: 'Bloom',          icon: '🌸' },
  { key: 'petal-fall',    label: 'Petal Fall',     icon: '🍃' },
  { key: 'nut-development', label: 'Nut Development', icon: '🌰' },
  { key: 'hull-split',    label: 'Hull Split',     icon: '🔓' },
  { key: 'harvest',       label: 'Harvest',        icon: '🌾' },
  { key: 'post-harvest',  label: 'Post-Harvest',   icon: '✅' },
];

export default function PhenologyTab({ data }: Props) {
  const currentIdx = STAGES.findIndex(s => s.key === data.currentStage);

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

      {/* Current stage hero */}
      <div className="rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50/40 dark:bg-brand-950/20 p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Current Growth Stage</h3>
          <SourceBadge source={data.source} />
        </div>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-4xl">{STAGES[currentIdx]?.icon}</span>
          <div>
            <p className="text-xl font-bold text-slate-900 dark:text-white">{STAGES[currentIdx]?.label}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{data.stageDescription}</p>
          </div>
        </div>
      </div>

      {/* Season timeline */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Season Timeline</h3>
        <div className="relative">
          {/* Track */}
          <div className="absolute top-3.5 left-0 right-0 h-0.5 bg-slate-200 dark:bg-slate-700" />
          <div className="flex justify-between relative">
            {STAGES.map((stage, idx) => {
              const isPast = idx < currentIdx;
              const isCurrent = idx === currentIdx;
              return (
                <div key={stage.key} className="flex flex-col items-center gap-1.5" style={{ width: `${100 / STAGES.length}%` }}>
                  <div className={`z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 text-sm transition-all ${
                    isCurrent ? 'border-brand-600 bg-brand-600 shadow-md shadow-brand-200' :
                    isPast ? 'border-brand-400 bg-brand-400' :
                    'border-slate-300 bg-white dark:bg-slate-900 dark:border-slate-600'
                  }`}>
                    {isCurrent ? (
                      <span className="text-white text-xs font-bold">●</span>
                    ) : isPast ? (
                      <span className="text-white text-xs">✓</span>
                    ) : (
                      <span className="text-slate-300 text-xs dark:text-slate-600">○</span>
                    )}
                  </div>
                  <span className={`text-center leading-tight ${
                    isCurrent ? 'text-brand-700 dark:text-brand-400 font-semibold' :
                    isPast ? 'text-slate-400 dark:text-slate-500' :
                    'text-slate-300 dark:text-slate-600'
                  }`} style={{ fontSize: '9px' }}>
                    {stage.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 mb-1">Cumulative GDD</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{data.cumulativeGDD.toLocaleString()}</p>
          <p className="text-xs text-teal-500 mt-1">Computed since Jan 1</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 mb-1">Chill Hours</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{data.chillHours.toLocaleString()}</p>
          <p className="text-xs text-teal-500 mt-1">Below 7°C since Nov</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 mb-1">Hull Split In</p>
          <p className="text-2xl font-bold text-amber-600">{data.daysToHullSplit}</p>
          <p className="text-xs text-slate-400 mt-1">days (est.)</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 mb-1">Bud Break</p>
          <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
            {data.budBreakDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          <p className="text-xs text-slate-400 mt-1">Manual record</p>
        </div>
      </div>

      {/* Harvest window */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Estimated Harvest Window</h3>
        <div className="flex items-center gap-3">
          <div className="flex-1 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-center">
            <p className="text-xs text-amber-600 font-medium">Starts</p>
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300 mt-0.5">
              {data.estimatedHarvestStart.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            </p>
          </div>
          <span className="text-slate-400 text-sm">→</span>
          <div className="flex-1 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-center">
            <p className="text-xs text-amber-600 font-medium">Ends</p>
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300 mt-0.5">
              {data.estimatedHarvestEnd.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
