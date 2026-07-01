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
      <div className="rounded-xl border border-green/25 bg-green-soft p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-ink-2">Current Growth Stage</h3>
          <SourceBadge source={data.source} />
        </div>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-4xl">{STAGES[currentIdx]?.icon}</span>
          <div>
            <p className="text-xl font-bold text-ink">{STAGES[currentIdx]?.label}</p>
            <p className="text-sm text-ink-2">{data.stageDescription}</p>
          </div>
        </div>
      </div>

      {/* Season timeline */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold text-ink-2 mb-4">Season Timeline</h3>
        <div className="relative">
          {/* Track */}
          <div className="absolute top-3.5 left-0 right-0 h-0.5 bg-line" />
          <div className="flex justify-between relative">
            {STAGES.map((stage, idx) => {
              const isPast = idx < currentIdx;
              const isCurrent = idx === currentIdx;
              return (
                <div key={stage.key} className="flex flex-col items-center gap-1.5" style={{ width: `${100 / STAGES.length}%` }}>
                  <div className={`z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 text-sm transition-all ${
                    isCurrent ? 'border-green bg-green shadow-md shadow-green-soft' :
                    isPast ? 'border-green/60 bg-green/60' :
                    'border-line bg-surface'
                  }`}>
                    {isCurrent ? (
                      <span className="text-white text-xs font-bold">●</span>
                    ) : isPast ? (
                      <span className="text-white text-xs">✓</span>
                    ) : (
                      <span className="text-ink-4 text-xs">○</span>
                    )}
                  </div>
                  <span className={`text-center leading-tight ${
                    isCurrent ? 'text-green font-semibold' :
                    isPast ? 'text-ink-4' :
                    'text-ink-4/60'
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
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs text-ink-3 mb-1">Cumulative GDD</p>
          <p className="text-2xl font-bold text-ink">{data.cumulativeGDD.toLocaleString()}</p>
          <p className="text-xs text-teal mt-1">Computed since Jan 1</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs text-ink-3 mb-1">Chill Hours</p>
          <p className="text-2xl font-bold text-ink">{data.chillHours.toLocaleString()}</p>
          <p className="text-xs text-teal mt-1">Below 7°C since Nov</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs text-ink-3 mb-1">Hull Split In</p>
          <p className="text-2xl font-bold text-amber">{data.daysToHullSplit}</p>
          <p className="text-xs text-ink-4 mt-1">days (est.)</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs text-ink-3 mb-1">Bud Break</p>
          <p className="text-sm font-bold text-ink mt-1">
            {data.budBreakDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          <p className="text-xs text-ink-4 mt-1">Manual record</p>
        </div>
      </div>

      {/* Harvest window */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold text-ink-2 mb-2">Estimated Harvest Window</h3>
        <div className="flex items-center gap-3">
          <div className="flex-1 rounded-lg bg-amber-soft border border-amber/25 p-3 text-center">
            <p className="text-xs text-amber font-medium">Starts</p>
            <p className="text-sm font-bold text-amber mt-0.5">
              {data.estimatedHarvestStart.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            </p>
          </div>
          <span className="text-ink-4 text-sm">→</span>
          <div className="flex-1 rounded-lg bg-amber-soft border border-amber/25 p-3 text-center">
            <p className="text-xs text-amber font-medium">Ends</p>
            <p className="text-sm font-bold text-amber mt-0.5">
              {data.estimatedHarvestEnd.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
