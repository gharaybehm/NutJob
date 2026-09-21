"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { assessMaturity } from '@/engines/maturity';
import { assessLeafSample, type LeafStatus } from '@/engines/nutrition';
import { getNutritionHistory, deleteTissueSample, type TissueSampleRow, type LastFertigation } from '@/app/actions/tissue';
import type { Block, NutritionDomain } from '../types';
import AlertBadge from '../AlertBadge';
import LogTissueSampleModal from '../LogTissueSampleModal';

interface Props {
  data: NutritionDomain;
  block: Block;
  farmId: string;
  canLog?: boolean;
}

const STATUS_STYLE: Record<LeafStatus, { badge: string; label: string }> = {
  adequate:  { badge: 'bg-green-soft text-green', label: 'Adequate' },
  marginal:  { badge: 'bg-amber-soft text-amber', label: 'Marginal' },
  deficient: { badge: 'bg-red-soft text-red',     label: 'Deficient' },
  high:      { badge: 'bg-amber-soft text-amber', label: 'High' },
};

const fmtDate = (iso: string, withYear = false) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC',
  });

export default function NutritionTab({ data, block, farmId, canLog = false }: Props) {
  const [samples, setSamples] = useState<TissueSampleRow[]>([]);
  const [lastFertigation, setLastFertigation] = useState<LastFertigation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getNutritionHistory(block.id);
    if (res.error) setError(res.error);
    else { setError(null); setSamples(res.samples); setLastFertigation(res.lastFertigation); }
    setLoading(false);
  }, [block.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of this block's history
    void load();
  }, [load]);

  const latest = samples[0] ?? null;
  const assessment = useMemo(() => {
    if (!latest) return null;
    const maturity = assessMaturity({
      plantingDate: block.plantingDate, plantingYear: block.plantingYear, cropType: block.cropType,
      now: new Date(`${latest.sampledAt.slice(0, 10)}T12:00:00Z`),
    });
    return assessLeafSample({ cropType: block.cropType, sampledAt: latest.sampledAt, values: latest.nutrients, maturity });
  }, [latest, block.plantingDate, block.plantingYear, block.cropType]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    const res = await deleteTissueSample(id, farmId);
    if (res.error) setError(res.error);
    else await load();
    setDeletingId(null);
  }

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
          <div className="flex items-center gap-3">
            {latest && <span className="text-xs text-ink-4">Sampled {fmtDate(latest.sampledAt, true)}</span>}
            {canLog && (
              <button
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-1 text-xs font-medium text-green hover:brightness-110 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Log analysis
              </button>
            )}
          </div>
        </div>

        {error && <div className="mb-3 rounded-lg border border-red/30 bg-red-soft px-3 py-2 text-sm text-red">{error}</div>}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-ink-3"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : !latest || !assessment ? (
          <p className="text-sm text-ink-3">
            No leaf analysis on record for this block.{canLog ? ' Log one after the lab report arrives.' : ''}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {!assessment.supported ? (
              <p className="rounded-lg bg-tile px-3 py-2 text-xs text-ink-3">{assessment.cautions[0]}</p>
            ) : (
              <>
                {assessment.results.length === 0 && (
                  <p className="text-sm text-ink-3">None of the recorded nutrients has a reference band.</p>
                )}
                <div className="flex flex-col divide-y divide-line">
                  {assessment.results.map(r => (
                    <div key={r.key} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-bold text-ink w-7">{r.symbol}</span>
                          <span className="text-sm text-ink-2">{r.value} {r.unit}</span>
                        </div>
                        <p className="text-xs text-ink-4">{r.bandText}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status].badge}`}>
                        {STATUS_STYLE[r.status].label}
                      </span>
                    </div>
                  ))}
                  {assessment.unjudged.map(u => (
                    <div key={u.symbol} className="flex items-center justify-between gap-3 py-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-bold text-ink w-7">{u.symbol}</span>
                        <span className="text-sm text-ink-2">{u.value} {u.unit}</span>
                      </div>
                      <span className="text-xs text-ink-4 text-right">Not judged: {u.reason}</span>
                    </div>
                  ))}
                </div>
                {assessment.cautions.map(c => (
                  <p key={c} className="rounded-lg border border-gold/30 bg-gold-soft px-3 py-2 text-xs text-ink-2">{c}</p>
                ))}
              </>
            )}
            {latest.labReference && <p className="text-xs text-ink-4">Lab report {latest.labReference}</p>}
            {latest.notes && <p className="text-xs text-ink-3">{latest.notes}</p>}
          </div>
        )}
      </div>

      {samples.length > 1 && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <h3 className="text-sm font-semibold text-ink-2 mb-2">Earlier analyses</h3>
          <div className="flex flex-col divide-y divide-line">
            {samples.slice(1).map(s => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-ink-2">{fmtDate(s.sampledAt, true)}</span>
                <span className="text-xs text-ink-4 truncate">
                  {Object.entries(s.nutrients).map(([k, v]) => `${k.toUpperCase()} ${v}`).join(' · ')}
                </span>
                {canLog && (
                  <button
                    onClick={() => handleDelete(s.id)}
                    disabled={deletingId === s.id}
                    aria-label="Delete analysis"
                    className="text-ink-4 hover:text-red transition-colors disabled:opacity-50"
                  >
                    {deletingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold text-ink-2 mb-3">Last Fertigation</h3>
        {lastFertigation ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-3">Date</span>
              <span className="text-sm font-medium text-ink">{fmtDate(lastFertigation.performedAt, true)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-3">Product</span>
              <span className="text-sm font-medium text-ink">{lastFertigation.product ?? 'not recorded'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-3">Rate</span>
              <span className="text-sm font-medium text-ink">
                {lastFertigation.amountPerTree != null
                  ? `${lastFertigation.amountPerTree} ${lastFertigation.unit ?? 'kg'}/tree`
                  : 'not recorded'}
              </span>
            </div>
            {lastFertigation.notes && (
              <div className="mt-1 rounded-lg bg-tile px-3 py-2 text-xs text-ink-3">{lastFertigation.notes}</div>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-3">No fertigation logged for this block.</p>
        )}
      </div>

      <LogTissueSampleModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={load}
        farmId={farmId}
        blockId={block.id}
        blockName={block.name}
        cropType={block.cropType}
      />
    </div>
  );
}
