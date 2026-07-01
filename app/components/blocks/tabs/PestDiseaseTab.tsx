import type { PestDiseaseDomain, PestObservation } from '../types';
import AlertBadge from '../AlertBadge';
import SourceBadge from '../SourceBadge';

interface Props { data: PestDiseaseDomain; }

function RiskBadge({ level }: { level: 'green' | 'amber' | 'red' }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
      level === 'green' ? 'bg-green-soft text-green' :
      level === 'amber' ? 'bg-amber-soft text-amber' : 'bg-red-soft text-red'
    }`}>
      {level === 'green' ? 'Low Risk' : level === 'amber' ? 'Moderate' : 'High Risk'}
    </span>
  );
}

function ObservationCard({ obs }: { obs: PestObservation }) {
  return (
    <div className={`rounded-xl border p-4 ${
      obs.riskLevel === 'red' ? 'border-red/25 bg-red-soft' :
      obs.riskLevel === 'amber' ? 'border-amber/25 bg-amber-soft' :
      'border-line bg-surface'
    }`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="text-sm font-semibold text-ink">{obs.commonName}</p>
          <p className="text-xs italic text-ink-4">{obs.pestName}</p>
        </div>
        <RiskBadge level={obs.riskLevel} />
      </div>
      <div className="flex flex-col gap-1 text-sm">
        {obs.observedCount && (
          <div className="flex items-center justify-between">
            <span className="text-ink-3">Count</span>
            <span className="font-medium text-ink-2">{obs.observedCount}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-ink-3">Status</span>
          <span className={`font-medium ${obs.stage === 'Active' ? 'text-amber' : obs.stage === 'Resolved' ? 'text-green' : 'text-ink-2'}`}>
            {obs.stage}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-ink-3">Last seen</span>
          <span className="font-medium text-ink-2">
            {obs.lastSeen.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
          </span>
        </div>
      </div>
      {obs.note && (
        <div className="mt-2 rounded-lg bg-white/60 px-3 py-2 text-xs text-ink-3 border border-line/60">
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
    data.overallRisk === 'green' ? 'text-green' :
    data.overallRisk === 'amber' ? 'text-amber' : 'text-red';

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
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-ink-3 mb-1">Overall Pest &amp; Disease Risk</p>
            <p className={`text-2xl font-bold ${riskColor} capitalize`}>
              {data.overallRisk === 'green' ? 'Low' : data.overallRisk === 'amber' ? 'Moderate' : 'High'}
            </p>
          </div>
          <SourceBadge source={data.source} />
        </div>
        <div className="mt-3 flex items-center justify-between text-sm text-ink-3">
          <span>
            Last scouting:{' '}
            <span className="font-medium text-ink-2">
              {data.lastScouting.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            </span>
          </span>
          <span>
            Next:{' '}
            <span className="font-medium text-green">
              {data.nextScouting.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            </span>
          </span>
        </div>
      </div>

      {/* Observations */}
      {data.observations.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink-2">Active Observations</h3>
          {data.observations.map(obs => <ObservationCard key={obs.id} obs={obs} />)}
        </div>
      ) : (
        <div className="rounded-xl border border-green/25 bg-green-soft p-6 text-center">
          <p className="text-3xl mb-2">✅</p>
          <p className="text-sm font-semibold text-green">No active pest observations</p>
          <p className="text-xs text-ink-3 mt-1">Block is clear. Continue scheduled scouting.</p>
        </div>
      )}
    </div>
  );
}
