'use client';

import { useState } from 'react';
import { Check, Loader2, Send } from 'lucide-react';
import { requestKnowledgeGuides } from '@/app/actions/knowledge-requests';
import { findCrop } from '@/utils/crops';
import type { GapKind, KnowledgeRequest } from '@/utils/kb-requests';

interface Props {
  farmId: string;
  cropType: string;
  variety: string | null;
  /** What is missing: the whole crop, or this variety. */
  kind: Exclude<GapKind, null>;
  /** The farm's request for this gap, if it already made one. */
  existing: KnowledgeRequest | null;
}

const STATUS_TEXT: Record<KnowledgeRequest['status'], string> = {
  open: 'Guides requested',
  in_progress: 'Guides requested: in progress',
  done: 'Request closed',
  declined: 'Request declined',
};

const INPUT =
  'w-full px-3 py-2 rounded-lg border border-line bg-surface text-ink text-xs focus:outline-none focus:ring-2 focus:ring-green transition placeholder:text-ink-4';

/**
 * Lets a supervisor or admin ask the platform admin to load guides for a crop or
 * variety that has none, and shows where an earlier request stands.
 */
export default function RequestGuides({ farmId, cropType, variety, kind, existing }: Props) {
  // The server's copy wins once it arrives, so the admin's later status and reply show.
  const [created, setRequest] = useState<KnowledgeRequest | null>(null);
  const request = existing ?? created;
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const subject = kind === 'variety' ? `${cropType} ${variety}` : cropType;

  if (request) {
    return (
      <div className="mt-2 text-xs text-ink-2">
        <p className="flex items-center gap-1.5 font-medium">
          <Check className="h-3.5 w-3.5 text-green shrink-0" />
          {STATUS_TEXT[request.status]} · {new Date(request.created_at).toLocaleDateString()}
        </p>
        {request.admin_note && <p className="mt-1 text-ink-3">Reply: {request.admin_note}</p>}
      </div>
    );
  }

  async function handleSend() {
    setIsPending(true);
    setError(null);
    try {
      const res = await requestKnowledgeGuides(farmId, { cropType, variety, note, link });
      if (res.error) setError(res.error);
      else if (res.request) setRequest(res.request);
    } catch {
      setError('The request could not be sent.');
    }
    setIsPending(false);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="mt-2 text-xs font-semibold text-green hover:underline">
        Request guides for {subject}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-line bg-surface p-3">
      <p className="text-xs text-ink-2">
        This asks the RootLoot administrator to load guides for <span className="font-semibold text-ink">{subject}</span>.
      </p>
      {kind === 'crop' && findCrop(cropType) === null && (
        <p className="text-xs text-ink-3">
          For a new crop, guides are only part of it: frost limits, water use by stage and growth stages also need figures confirmed by an agronomist, so those calculations stay off until that is done.
        </p>
      )}
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={1000}
        placeholder="Anything that helps (optional): rootstock, nursery, what you need advice on"
        className={`${INPUT} resize-none`} />
      <input type="url" value={link} onChange={e => setLink(e.target.value)} maxLength={500}
        placeholder="Link to a guide or datasheet you already have (optional)"
        className={INPUT} />
      {error && <p className="text-xs text-red">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={() => { setOpen(false); setError(null); }} disabled={isPending}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-ink-2 hover:bg-tile-2 transition-colors disabled:opacity-50">
          Cancel
        </button>
        <button type="button" onClick={handleSend} disabled={isPending}
          className="flex items-center gap-1.5 rounded-lg bg-green px-3 py-1.5 text-xs font-semibold text-white hover:brightness-105 disabled:opacity-60 transition">
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Send request
        </button>
      </div>
    </div>
  );
}
