"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { updateKnowledgeRequest } from "@/app/(superadmin)/admin/actions";
import type { GapRequest, KnowledgeRequestStatus } from "@/utils/kb-requests";

const STATUS_LABELS: Record<KnowledgeRequestStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Closed",
  declined: "Declined",
};

/** One farm's request under a gap: what they asked, and the admin's status and reply. */
export default function KnowledgeRequestRow({ request, requesterName }: { request: GapRequest; requesterName: string }) {
  const [status, setStatus] = useState<KnowledgeRequestStatus>(request.status);
  const [adminNote, setAdminNote] = useState(request.admin_note ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSave() {
    setIsPending(true);
    setError(null);
    setSaved(false);
    try {
      const res = await updateKnowledgeRequest(request.id, { status, adminNote });
      if (res.error) setError(res.error);
      else setSaved(true);
    } catch {
      setError("Save failed");
    }
    setIsPending(false);
  }

  return (
    <div className="rounded-lg bg-tile px-4 py-3">
      <p className="text-sm text-ink">
        <span className="font-semibold">{request.farmName}</span>
        <span className="text-ink-3"> · {requesterName} · {new Date(request.created_at).toLocaleDateString()}</span>
      </p>
      {request.note && <p className="mt-1 text-sm text-ink-2">{request.note}</p>}
      {request.link && (
        <a href={request.link} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-sm text-green underline underline-offset-2">
          {request.link}
        </a>
      )}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <select value={status} onChange={(e) => setStatus(e.target.value as KnowledgeRequestStatus)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-green">
          {(Object.keys(STATUS_LABELS) as KnowledgeRequestStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <input type="text" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} maxLength={1000}
          placeholder="Reply the farm will see (optional)"
          className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-green" />
        <button type="button" onClick={handleSave} disabled={isPending}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-green px-3 py-2 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
          {saved ? "Saved" : "Save"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red">{error}</p>}
    </div>
  );
}
