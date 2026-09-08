"use client";

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import type { PhenologyDomain, GrowthStage } from '../types';
import AlertBadge from '../AlertBadge';
import SourceBadge from '../SourceBadge';
import {
  getPhenologyEvents,
  deletePhenologyEvent,
  type PhenologyEvent,
} from '@/app/actions/phenology';
import LogPhenologyModal from '../LogPhenologyModal';

interface Props {
  data: PhenologyDomain;
  blockId: string;
  blockName: string;
  farmId: string;
  canLog?: boolean;
}

const EVENT_LABELS: Record<string, string> = {
  'bud-break':     '🌿 Bud Break',
  'full-bloom':    '🌸 Full Bloom',
  'petal-fall':    '🍃 Petal Fall',
  'hull-split':    '🔓 Hull Split',
  'harvest-start': '🌾 Harvest Start',
  'harvest-end':   '✅ Harvest End',
};

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

// These come from manual phenology records, which may not exist yet.
function formatDate(date: Date | null, opts: Intl.DateTimeFormatOptions): string {
  if (!date) return '—';
  return date.toLocaleDateString('en-AU', opts);
}

export default function PhenologyTab({ data, blockId, blockName, farmId, canLog = false }: Props) {
  const currentIdx = STAGES.findIndex(s => s.key === data.currentStage);

  const [events, setEvents] = useState<PhenologyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Captured once so render stays pure — the season-complete cutoff is months
  // wide, so a clock frozen at mount is plenty precise.
  const [mountedAt] = useState(() => Date.now());

  const loadEvents = useCallback(async () => {
    const result = await getPhenologyEvents(blockId);
    if (result.error) setError(result.error);
    else setEvents(result.data ?? []);
    setLoading(false);
  }, [blockId]);

  useEffect(() => {
    if (!blockId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for async fetch triggered by prop change
    setLoading(true);
    loadEvents();
  }, [blockId, loadEvents]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    const result = await deletePhenologyEvent(id, farmId);
    if (result.error) setError(result.error);
    else setEvents(prev => prev.filter(e => e.id !== id));
    setDeletingId(null);
  }

  // Predictions are anchored on an observed bloom or bud-break date. Without
  // one there is nothing to measure heat accumulation from.
  const anchor = events.find(e => e.event_type === 'full-bloom')
    ?? events.find(e => e.event_type === 'bud-break');
  const hasAnchor = Boolean(anchor);

  // An anchor from many months back with nothing predicted means the season
  // has run its course, not that the calculation is pending.
  const anchorAgeDays = anchor
    ? (mountedAt - new Date(`${anchor.observed_on}T00:00:00`).getTime()) / 86_400_000
    : 0;
  const seasonLikelyComplete = anchorAgeDays > 210;

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
          <p className="text-2xl font-bold text-amber">{data.daysToHullSplit || '—'}</p>
          <p className="text-xs text-ink-4 mt-1">days (est.)</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs text-ink-3 mb-1">Bud Break</p>
          <p className="text-sm font-bold text-ink mt-1">
            {formatDate(data.budBreakDate, { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          <p className="text-xs text-ink-4 mt-1">
            {data.budBreakDate ? 'Observed' : 'Not observed yet'}
          </p>
        </div>
      </div>

      {/* Harvest window */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-ink-2">Estimated Harvest Window</h3>
          {(data.estimatedHarvestStart || data.estimatedHarvestEnd) && (
            <span
              className="rounded-full bg-tile px-2 py-0.5 text-[10px] font-semibold text-ink-3"
              title="Projected from heat accumulated since the observed anchor date, using uncalibrated default thresholds. Expect the estimate to tighten after a season of observed dates."
            >
              PROVISIONAL
            </span>
          )}
        </div>
        {data.estimatedHarvestStart || data.estimatedHarvestEnd ? (
          <>
            <div className="flex items-center gap-3">
              <div className="flex-1 rounded-lg bg-amber-soft border border-amber/25 p-3 text-center">
                <p className="text-xs text-amber font-medium">Starts</p>
                <p className="text-sm font-bold text-amber mt-0.5">
                  {formatDate(data.estimatedHarvestStart, { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <span className="text-ink-4 text-sm">→</span>
              <div className="flex-1 rounded-lg bg-amber-soft border border-amber/25 p-3 text-center">
                <p className="text-xs text-amber font-medium">Ends</p>
                <p className="text-sm font-bold text-amber mt-0.5">
                  {formatDate(data.estimatedHarvestEnd, { day: 'numeric', month: 'short' })}
                </p>
              </div>
            </div>
            <p className="text-xs text-ink-4 mt-2">
              Projected from accumulated growing degree days since the observed anchor date,
              extended using this site&rsquo;s climate normals. Recalculated daily.
            </p>
          </>
        ) : (
          <p className="text-sm text-ink-4">
            {!hasAnchor
              ? 'Log a full bloom (or bud break) observation below and the harvest window will be projected from accumulated heat.'
              : seasonLikelyComplete
                ? 'This season has run its course — predictions resume once the next season’s bloom is logged.'
                : 'Not calculated yet — the daily compute job will fill this in on its next run.'}
          </p>
        )}
      </div>

      {/* Observation log */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-ink-2">Season Observations</h3>
            <p className="text-xs text-ink-4 mt-0.5">
              What you saw in the orchard — the sensors cannot measure these.
            </p>
          </div>
          {canLog && (
            <button
              onClick={() => setModalOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-green hover:text-green transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Log Observation
            </button>
          )}
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red/30 bg-red-soft px-3 py-2 text-xs text-red">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-6 text-sm text-ink-4">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : events.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-4">
            No observations logged yet.
            {canLog
              ? ' Full bloom is the one worth recording first.'
              : ' Ask a farm admin or supervisor to record them.'}
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {events.map(ev => (
              <div key={ev.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {EVENT_LABELS[ev.event_type] ?? ev.event_type}
                  </p>
                  {ev.notes && <p className="text-xs text-ink-4 truncate">{ev.notes}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs font-medium text-ink-2">
                    {new Date(`${ev.observed_on}T00:00:00`).toLocaleDateString('en-AU', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </span>
                  {canLog && (
                    <button
                      onClick={() => handleDelete(ev.id)}
                      disabled={deletingId === ev.id}
                      className="text-ink-4 hover:text-red transition-colors disabled:opacity-50"
                      aria-label="Delete observation"
                    >
                      {deletingId === ev.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <LogPhenologyModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={loadEvents}
        farmId={farmId}
        blockId={blockId}
        blockName={blockName}
      />
    </div>
  );
}
