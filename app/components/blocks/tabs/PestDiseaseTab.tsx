import type { PestDiseaseDomain, PestObservation } from '../types';
import AlertBadge from '../AlertBadge';
import SourceBadge from '../SourceBadge';

interface Props { data: PestDiseaseDomain; }

function RiskBadge({ level }: { level: 'green' | 'amber' | 'red' }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
      level === 'green' ? 'bg-brand-100 text-brand-700' :
      level === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
    }`}>
      {level === 'green' ? 'Low Risk' : level === 'amber' ? 'Moderate' : 'High Risk'}
    </span>
  );
}

function ObservationCard({ obs }: { obs: PestObservation }) {
  return (
    <div className={`rounded-xl border p-4 ${
      obs.riskLevel === 'red' ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20' :
      obs.riskLevel === 'amber' ? 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20' :
      'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
    }`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{obs.commonName}</p>
          <p className="text-xs italic text-slate-400">{obs.pestName}</p>
        </div>
        <RiskBadge level={obs.riskLevel} />
      </div>
      <div className="flex flex-col gap-1 text-sm">
        {obs.observedCount && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Count</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">{obs.observedCount}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Status</span>
          <span className={`font-medium ${obs.stage === 'Active' ? 'text-amber-600' : obs.stage === 'Resolved' ? 'text-brand-600' : 'text-slate-600 dark:text-slate-300'}`}>
            {obs.stage}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Last seen</span>
          <span className="font-medium text-slate-800 dark:text-slate-200">
            {obs.lastSeen.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
          </span>
        </div>
      </div>
      {obs.note && (
        <div className="mt-2 rounded-lg bg-white/60 dark:bg-slate-800/60 px-3 py-2 text-xs text-slate-500 border border-slate-200/60 dark:border-slate-700/60">
          {obs.note}
        </div>
      )}
      <div className="mt-2">
        <SourceBadge source={obs.source} />
      </div>
    </div>
  );
}

export default function PestDiseaseTab({ data }: Props) {
  const riskColor =
    data.overallRisk === 'green' ? 'text-brand-600' :
    data.overallRisk === 'amber' ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="flex flex-col gap-6">
      {data.alerts.length > 0 && (
        <div className="flex flex-col gap-2">
          {data.alerts.map(a => (
            <AlertBadge key={a.id} severity={a.severity} message={a.message} source={a.source} timestamp={a.timestamp} />
          ))}
        </div>
      )}

      {/* Overall risk header */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 mb-1">Overall Pest &amp; Disease Risk</p>
            <p className={`text-2xl font-bold ${riskColor} capitalize`}>
              {data.overallRisk === 'green' ? 'Low' : data.overallRisk === 'amber' ? 'Moderate' : 'High'}
            </p>
          </div>
          <SourceBadge source={data.source} />
        </div>
        <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
          <span>
            Last scouting:{' '}
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {data.lastScouting.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            </span>
          </span>
          <span>
            Next:{' '}
            <span className="font-medium text-brand-600">
              {data.nextScouting.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            </span>
          </span>
        </div>
      </div>

      {/* Observations */}
      {data.observations.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Active Observations</h3>
          {data.observations.map(obs => <ObservationCard key={obs.id} obs={obs} />)}
        </div>
      ) : (
        <div className="rounded-xl border border-brand-200 dark:border-brand-800/50 bg-brand-50/40 dark:bg-brand-950/20 p-6 text-center">
          <p className="text-3xl mb-2">✅</p>
          <p className="text-sm font-semibold text-brand-700 dark:text-brand-400">No active pest observations</p>
          <p className="text-xs text-slate-500 mt-1">Block is clear. Continue scheduled scouting.</p>
        </div>
      )}
    </div>
  );
}
