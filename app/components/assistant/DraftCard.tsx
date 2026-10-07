"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BookOpen, BookDashed, CalendarClock, Calculator, Check, X, Loader2 } from "lucide-react";
import { acceptAssistantDraft, dismissAssistantDraft } from "@/app/actions/assistant-drafts";
import ScheduleFields, { defaultHoursFor, nextHourLocal } from "@/app/components/recommendations/ScheduleFields";
import { CATEGORY_STYLES, type Category } from "@/app/components/ui/CategoryChip";
import type { AssistantDraft, DraftState } from "@/utils/assistant/types";

// A draft recommendation card in an assistant answer. It is the pending
// stage: nothing is written until it is accepted (booked on the calendar) or
// dismissed with a reason. The server re-reads the draft; only its message id
// and index are sent.

type Mode = "view" | "schedule" | "dismiss";

export default function DraftCard({
  farmId, messageId, indexes, drafts, states, canAct, readOnly, onDone,
}: {
  farmId: string;
  messageId: string;
  /** The same action on one or more blocks: one draft (and one index) per block. */
  indexes: number[];
  drafts: AssistantDraft[];
  states: (DraftState | undefined)[];
  /** The viewer asked the question (a farm admin reading someone else's conversation cannot act). */
  canAct: boolean;
  readOnly: boolean;
  onDone: (index: number, state: DraftState) => void;
}) {
  const draft = drafts[0];
  const pending = indexes.filter((_, i) => !states[i]);
  const state = pending.length === 0 ? states[0] : undefined;
  const blockNames = drafts.map((d) => d.block_name).join(", ");
  const t = useTranslations("assistant.drafts");
  const tRec = useTranslations("recommendations");
  const [mode, setMode] = useState<Mode>("view");
  const [title, setTitle] = useState(draft.title);
  const [note, setNote] = useState("");
  const [startLocal, setStartLocal] = useState("");
  const [durationHours, setDurationHours] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const style = draft.category in CATEGORY_STYLES ? CATEGORY_STYLES[draft.category as Category] : { bg: "bg-tile-2", text: "text-ink-2" };
  const categoryLabel = draft.category in CATEGORY_STYLES ? tRec(`categories.${draft.category as Category}`) : draft.category;

  function openSchedule() {
    setStartLocal(nextHourLocal());
    setDurationHours(defaultHoursFor(draft.category));
    setError(null);
    setMode("schedule");
  }

  // One server call per block; each is checked and written on its own, so one
  // failure leaves the others done and the card shows what is left.
  async function accept() {
    if (!startLocal) return;
    setBusy(true);
    setError(null);
    const schedule = { start: new Date(startLocal).toISOString(), durationHours: Number(durationHours) || undefined };
    const edits = { title: title.trim() !== draft.title ? title : undefined, note: note.trim() || undefined };
    const edited = title.trim() !== draft.title || note.trim().length > 0;
    for (const index of pending) {
      try {
        const res = await acceptAssistantDraft(farmId, messageId, index, schedule, edits);
        if (res.ok && res.recommendationId) {
          onDone(index, { state: edited ? "edited" : "accepted", recommendation_id: res.recommendationId, at: new Date().toISOString() });
        } else {
          setError(res.code === "read_only" ? t("readOnly") : res.code === "already" ? t("already") : (res.error ?? t("failed")));
          if (res.code === "read_only") break;
        }
      } catch {
        setError(t("failed"));
      }
    }
    setBusy(false);
  }

  async function dismiss(reason: "already_done" | "disagree" | "no_resources" | null) {
    setBusy(true);
    setError(null);
    for (const index of pending) {
      try {
        const res = await dismissAssistantDraft(farmId, messageId, index, reason);
        if (res.ok) onDone(index, { state: "dismissed", recommendation_id: "", reason, at: new Date().toISOString() });
        else setError(res.code === "already" ? t("already") : (res.error ?? t("failed")));
      } catch {
        setError(t("failed"));
      }
    }
    setBusy(false);
  }

  return (
    <div className="mt-2.5 rounded-xl border border-line bg-surface p-3 text-ink">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink-2">{t("label")} · {blockNames}</span>
        <span className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide ${style.bg} ${style.text}`}>
          {categoryLabel.toUpperCase()}
        </span>
      </div>
      <p className="mt-1.5 text-sm font-semibold">{draft.title}</p>
      <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{draft.rationale}</p>
      <p className="mt-1.5 text-[11px] text-ink-4">
        {tRec("confidence")}: {draft.confidence}%
      </p>
      {draft.from_calculation ? (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-3">
          <Calculator className="h-3 w-3 shrink-0" aria-hidden="true" />
          {draft.sources[0]?.title ?? t("fromCalculation")}
        </p>
      ) : draft.sources.length > 0 ? (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-4">
          <BookOpen className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {draft.sources.map((s) => `${s.n ? `[${s.n}] ` : ""}${s.title}${s.section ? ` — ${s.section}` : ""}`).join("; ")}
          </span>
        </p>
      ) : (
        <p className={`mt-1 flex items-center gap-1 text-[11px] ${draft.reference_status === "none_loaded" || draft.reference_status === "error" ? "text-amber-ink" : "text-ink-4"}`}>
          <BookDashed className="h-3 w-3 shrink-0" aria-hidden="true" />
          {tRec("notSourceBacked")}
        </p>
      )}

      {drafts.length > 1 && !state && (
        <p className="mt-1 text-[11px] text-ink-3">{t("perBlock", { count: pending.length })}</p>
      )}
      {state ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-green">
          {state.state === "dismissed" ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          {state.state === "dismissed" ? t("dismissed") : state.state === "edited" ? t("acceptedEdited") : t("accepted")}
        </p>
      ) : !canAct ? null : mode === "view" ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" onClick={openSchedule} disabled={readOnly}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green px-3 py-1.5 text-xs font-semibold text-white hover:brightness-105 disabled:opacity-50"
            title={readOnly ? t("readOnly") : undefined}>
            <CalendarClock className="h-3.5 w-3.5" />
            {t("acceptAndSchedule")}
          </button>
          <button type="button" onClick={() => { setError(null); setMode("dismiss"); }}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-tile">
            {t("dismiss")}
          </button>
          {readOnly && <p className="w-full text-[11px] text-amber-ink">{t("readOnly")}</p>}
        </div>
      ) : mode === "schedule" ? (
        <div className="mt-2.5 space-y-2.5 border-t border-line-soft pt-2.5">
          <label className="block text-[13px] text-ink-2">
            {t("title")}
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-green/30" />
          </label>
          <ScheduleFields startLocal={startLocal} setStartLocal={setStartLocal} durationHours={durationHours} setDurationHours={setDurationHours} />
          <label className="block text-[13px] text-ink-2">
            {tRec("managerNote")} <span className="text-ink-4">{tRec("managerNoteOptional")}</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000}
              className="mt-1 w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-green/30" />
          </label>
          <p className="text-[11px] text-ink-3">{tRec("scheduleHint")}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode("view")} disabled={busy}
              className="flex-1 rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink-2 hover:bg-tile disabled:opacity-50">
              {tRec("cancel")}
            </button>
            <button type="button" onClick={accept} disabled={busy || !startLocal}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green px-3 py-2 text-xs font-semibold text-white hover:brightness-105 disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />}
              {tRec("schedule")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2.5 space-y-2 border-t border-line-soft pt-2.5">
          <p className="text-[13px] text-ink-2">{tRec("skipQuestion")}</p>
          <div className="flex flex-wrap gap-2">
            {(["already_done", "disagree", "no_resources"] as const).map((reason) => (
              <button key={reason} type="button" onClick={() => dismiss(reason)} disabled={busy}
                className="rounded-full border border-line bg-tile px-3 py-1.5 text-xs font-medium text-ink hover:border-ink-4 disabled:opacity-50">
                {tRec(`skipReasons.${reason}`)}
              </button>
            ))}
          </div>
          <div className="flex justify-between">
            <button type="button" onClick={() => setMode("view")} disabled={busy} className="text-xs text-ink-3 hover:underline">
              {tRec("cancel")}
            </button>
            <button type="button" onClick={() => dismiss(null)} disabled={busy} className="text-xs text-ink-3 hover:underline">
              {tRec("skipNoReason")}
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red">{error}</p>}
    </div>
  );
}
