'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import type { FarmWithMeta } from '@/utils/supabase/farm-types';
import { deleteFarm } from '@/app/actions/farms';

interface Props {
  farm: FarmWithMeta;
  onClose: () => void;
  onDeleted: () => void;
}

export default function DeleteFarmDialog({ farm, onClose, onDeleted }: Props) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = confirmText.trim() === farm.name.trim();

  async function handleDelete() {
    if (!confirmed || deleting) return;
    setDeleting(true);
    setError(null);
    const result = await deleteFarm(farm.id);
    if (result.error) {
      setDeleting(false);
      setError(result.error);
      return;
    }
    onDeleted();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-farm-title"
    >
      <div className="relative w-full max-w-md bg-surface rounded-2xl shadow-2xl ring-1 ring-line overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-tile">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-red/10">
              <AlertTriangle className="h-[18px] w-[18px] text-red" />
            </div>
            <div>
              <h2 id="delete-farm-title" className="text-lg font-semibold text-ink leading-tight">
                Delete {farm.name}?
              </h2>
              <p className="mt-0.5 text-xs text-ink-3">This action is permanent and cannot be undone.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={deleting}
            aria-label="Close"
            className="rounded-lg p-1 text-ink-3 hover:bg-tile hover:text-ink transition disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl border border-red/25 bg-red/[0.06] px-4 py-3">
            <p className="text-sm text-ink-2 leading-relaxed">
              Deleting this farm permanently removes{' '}
              <span className="font-semibold text-ink">
                {farm.blockCount} {farm.blockCount === 1 ? 'block' : 'blocks'}
              </span>{' '}
              along with all of its sensors, readings, calendar events, recommendations, inventory,
              activity history, and team members. There is no way to restore it.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red/30 bg-red/10 px-3 py-2 text-sm text-red">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="delete-farm-confirm"
              className="block text-xs font-semibold text-ink-3 uppercase tracking-wider mb-1.5"
            >
              Type <span className="font-mono normal-case text-ink-2">{farm.name}</span> to confirm
            </label>
            <input
              id="delete-farm-confirm"
              type="text"
              autoFocus
              autoComplete="off"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={farm.name}
              className="w-full px-3 py-2.5 rounded-lg border border-red/30 bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-red transition"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-tile bg-paper-2">
          <button
            onClick={onClose}
            disabled={deleting}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-2 hover:bg-tile transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!confirmed || deleting}
            className="flex items-center gap-2 rounded-xl bg-red px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}
