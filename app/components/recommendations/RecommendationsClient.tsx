"use client";

import { useState, useTransition, useRef, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import RecommendationCard from "./RecommendationCard";
import {
  acceptRecommendation,
  skipRecommendation,
  editRecommendation,
  type SkipReason,
  generateAIRecommendations,
  generateMockRecommendations,
} from "@/app/[farmId]/(dashboard)/recommendations/actions";
import {
  Sparkles,
  Filter,
  CheckCircle2,
  Clock,
  Activity,
  X as XIcon,
  Edit2,
  Cpu,
  CalendarClock,
} from "lucide-react";

type Category = "irrigate" | "fertilize" | "spray" | "scout" | "prune" | "other";
type Status = "pending" | "accepted" | "edited" | "skipped";

interface RecommendationSource {
  title: string;
  section: string | null;
}

interface Recommendation {
  id: string;
  category: Category;
  title: string;
  rationale: string;
  confidence: number | null;
  status: Status;
  block_id: string | null;
  manager_note: string | null;
  blocks?: { name: string } | null;
  created_at: string;
  expires_at: string | null;
  sources?: RecommendationSource[] | null;
  activity_log_id?: string | null;
  scheduled_event?: { id: string; start_date: string; completed_at: string | null } | null;
}

interface Props {
  initialRecommendations: Recommendation[];
  farmId: string;
}

interface EditTarget {
  id: string;
  title: string;
  rationale: string;
  blockName?: string;
  sources?: RecommendationSource[] | null;
}

export default function RecommendationsClient({ initialRecommendations, farmId }: Props) {
  const router = useRouter();
  const t = useTranslations('recommendations');
  const [isPending, startTransition] = useTransition();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const [statusFilter, setStatusFilter] = useState<"pending" | "acted">("pending");
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");

  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNote, setEditNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // Accept → pick when the work happens; Skip → say why.
  const [scheduleTarget, setScheduleTarget] = useState<Recommendation | null>(null);
  const [skipTarget, setSkipTarget] = useState<Recommendation | null>(null);
  const [startLocal, setStartLocal] = useState("");
  const [durationHours, setDurationHours] = useState("");

  useEffect(() => {
    if (editTarget) noteRef.current?.focus();
  }, [editTarget]);

  const CATEGORIES: { id: Category | "all"; label: string }[] = [
    { id: "all",       label: t('categories.all')      },
    { id: "irrigate",  label: t('categories.irrigate') },
    { id: "fertilize", label: t('categories.fertilize')},
    { id: "spray",     label: t('categories.spray')    },
    { id: "scout",     label: t('categories.scout')    },
    { id: "prune",     label: t('categories.prune')    },
  ];

  const resetSchedule = (rec: Recommendation) => {
    setStartLocal(nextHourLocal());
    setDurationHours(String(rec.category === "irrigate" ? 4 : rec.category === "scout" ? 1 : 2));
  };

  const scheduleInput = () => ({
    start: new Date(startLocal).toISOString(),
    durationHours: Number(durationHours) || undefined,
  });

  const openEdit = (rec: Recommendation) => {
    setEditTarget({ id: rec.id, title: rec.title, rationale: rec.rationale, blockName: rec.blocks?.name, sources: rec.sources });
    setEditTitle(rec.title);
    setEditNote("");
    resetSchedule(rec);
  };

  const openSchedule = (rec: Recommendation) => {
    setScheduleTarget(rec);
    resetSchedule(rec);
  };

  const closeEdit = () => { setEditTarget(null); setEditTitle(""); setEditNote(""); };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setIsSaving(true);
    try {
      await editRecommendation(editTarget.id, {
        title: editTitle.trim() || editTarget.title,
        manager_note: editNote.trim() || undefined,
      }, farmId, scheduleInput());
      startTransition(() => { router.refresh(); });
      closeEdit();
    } catch (error) {
      console.error("Failed to save edit:", error);
      alert("Failed to save changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const runForCard = async (id: string, action: () => Promise<void>) => {
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      await action();
      startTransition(() => { router.refresh(); });
    } catch (error) {
      console.error("Failed to update recommendation:", error);
      alert(error instanceof Error ? error.message : "Failed to update recommendation. Please try again.");
    } finally {
      setTimeout(() => {
        setProcessingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      }, 500);
    }
  };

  const handleConfirmSchedule = async () => {
    if (!scheduleTarget || !startLocal) return;
    const id = scheduleTarget.id;
    const input = scheduleInput();
    setScheduleTarget(null);
    await runForCard(id, () => acceptRecommendation(id, farmId, input));
  };

  const handleSkip = async (reason?: SkipReason) => {
    if (!skipTarget) return;
    const id = skipTarget.id;
    setSkipTarget(null);
    await runForCard(id, () => skipRecommendation(id, farmId, reason));
  };

  const handleGenerateAI = async () => {
    setProcessingIds((prev) => new Set(prev).add("ai-generate"));
    try {
      const result = await generateAIRecommendations(farmId);
      if ("error" in result) {
        alert(`AI generation failed: ${result.error}`);
        return;
      }
      startTransition(() => { router.refresh(); });
      if (result.count === 0) {
        alert("The AI found no new recommendations needed based on current block data.");
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      alert(`AI generation failed: ${msg}`);
    } finally {
      setProcessingIds((prev) => { const next = new Set(prev); next.delete("ai-generate"); return next; });
    }
  };

  const handleGenerateMock = async () => {
    setProcessingIds((prev) => new Set(prev).add("generate"));
    try {
      await generateMockRecommendations(farmId);
      startTransition(() => { router.refresh(); });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      alert(`Failed to generate mock data: ${msg}`);
    } finally {
      setProcessingIds((prev) => { const next = new Set(prev); next.delete("generate"); return next; });
    }
  };

  const filteredRecommendations = initialRecommendations.filter((rec) => {
    const matchesStatus = statusFilter === "pending" ? rec.status === "pending" : rec.status !== "pending";
    const matchesCategory = categoryFilter === "all" || rec.category === categoryFilter;
    return matchesStatus && matchesCategory;
  });

  // Derive batch metadata from the most-recently-generated pending recommendations
  const pendingRecs = initialRecommendations.filter((r) => r.status === "pending");
  const latestBatchDate = pendingRecs.length > 0
    ? new Date(Math.max(...pendingRecs.map((r) => new Date(r.created_at).getTime())))
    : null;
  const latestExpiry = pendingRecs.length > 0 && pendingRecs[0].expires_at
    ? new Date(Math.max(...pendingRecs.map((r) => r.expires_at ? new Date(r.expires_at).getTime() : 0)))
    : null;
  const formatShort = (d: Date) =>
    d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  // eslint-disable-next-line react-hooks/purity -- coarse 48h expiry check; per-render evaluation is intentional
  const isExpiringSoon = latestExpiry && (latestExpiry.getTime() - Date.now()) < 2 * 24 * 60 * 60 * 1000;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-surface p-4 rounded-2xl border border-line">
        {/* Status Toggle */}
        <div className="flex p-1 bg-tile-2 rounded-lg">
          <button
            onClick={() => setStatusFilter("pending")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              statusFilter === "pending"
                ? "bg-surface text-ink shadow-sm"
                : "text-ink-2 hover:text-ink"
            }`}
          >
            <Clock className="h-4 w-4" />
            {t('pending')}
          </button>
          <button
            onClick={() => setStatusFilter("acted")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              statusFilter === "acted"
                ? "bg-surface text-ink shadow-sm"
                : "text-ink-2 hover:text-ink"
            }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            {t('history')}
          </button>
        </div>

        {/* AI Generate button */}
        <button
          onClick={handleGenerateAI}
          disabled={processingIds.has("ai-generate") || isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-[11px] bg-gradient-to-b from-[#37905C] to-green text-white text-sm font-semibold shadow-[0_6px_16px_-4px_rgba(47,125,79,.5)] transition hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {processingIds.has("ai-generate") ? (
            <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <Cpu className="h-4 w-4" />
          )}
          {processingIds.has("ai-generate") ? t('generating') : t('generateAI')}
        </button>

        {/* Category Filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-ink-3 shrink-0 ms-1" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as Category | "all")}
            className="bg-tile-2 border-none text-sm font-medium text-ink-2 rounded-lg py-2 ps-3 pe-8 focus:ring-2 focus:ring-green/40 cursor-pointer"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Batch info banner — shown when there are pending recommendations with dates */}
      {statusFilter === "pending" && latestBatchDate && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm border ${
          isExpiringSoon
            ? "bg-amber-soft border-amber/30 text-amber-ink"
            : "bg-tile border-line text-ink-2"
        }`}>
          <CalendarClock className="h-4 w-4 shrink-0" />
          <span>
            Generated: <span className="font-medium">{formatShort(latestBatchDate)}</span>
            {latestExpiry && (
              <>
                {" · "}
                {isExpiringSoon ? "Expires soon: " : "Valid until: "}
                <span className="font-medium">{formatShort(latestExpiry)}</span>
              </>
            )}
            {" · "}Refreshed weekly by the AI Agronomist
          </span>
        </div>
      )}

      {filteredRecommendations.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredRecommendations.map((rec) => (
            <RecommendationCard
              key={rec.id}
              id={rec.id}
              category={rec.category}
              title={rec.title}
              rationale={rec.rationale}
              confidence={rec.confidence}
              status={rec.status}
              blockName={rec.blocks?.name}
              managerNote={rec.manager_note}
              sources={rec.sources}
              scheduledEvent={rec.scheduled_event}
              activityLogId={rec.activity_log_id}
              farmId={farmId}
              onAccept={() => openSchedule(rec)}
              onSkip={() => setSkipTarget(rec)}
              onEdit={() => openEdit(rec)}
              isProcessing={processingIds.has(rec.id) || isPending}
            />
          ))}
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-dashed border-line p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
          <div className="h-16 w-16 bg-green-soft rounded-full flex items-center justify-center mb-4">
            <Activity className="h-8 w-8 text-green" />
          </div>
          <h3 className="font-heading text-xl font-semibold text-ink mb-2">
            {statusFilter === "pending" ? t('noPending') : t('noHistory')}
          </h3>
          <p className="text-ink-2 max-w-md mx-auto mb-8 leading-relaxed">
            {statusFilter === "pending" ? t('pendingDesc') : t('historyDesc')}
          </p>
          <button
            onClick={handleGenerateMock}
            disabled={processingIds.has("generate") || isPending}
            className="bg-ink text-white hover:brightness-110 px-6 py-3 rounded-lg font-medium shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processingIds.has("generate") ? (
              <div className="h-5 w-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
            {t('generateMock')}
          </button>
        </div>
      )}

      {/* Edit Modal */}
      {editTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}
        >
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg border border-line overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-line-soft">
              <div className="flex items-center gap-2 text-ink font-semibold">
                <Edit2 className="h-4 w-4 text-green" />
                {t('editTitle')}
              </div>
              <button onClick={closeEdit} className="p-1.5 rounded-lg text-ink-3 hover:bg-tile transition-colors">
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {editTarget.blockName && (
                <p className="text-sm font-medium text-green">
                  {t('target', { name: editTarget.blockName })}
                </p>
              )}
              <div>
                <label className="block font-mono text-[11px] text-ink-3 tracking-wide mb-1.5">
                  {t('actionTitle').toUpperCase()}
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-green/30 transition"
                />
              </div>
              <div>
                <label className="block font-mono text-[11px] text-ink-3 tracking-wide mb-1.5">
                  {t('aiRationale').toUpperCase()}
                </label>
                <p className="text-sm text-ink-2 bg-tile rounded-lg px-3 py-2.5 leading-relaxed">
                  {editTarget.rationale}
                </p>
              </div>
              {editTarget.sources && editTarget.sources.length > 0 && (
                <div>
                  <label className="block font-mono text-[11px] text-ink-3 tracking-wide mb-1.5">
                    {t('aiSources').toUpperCase()}
                  </label>
                  <ul className="text-sm text-ink-2 bg-tile rounded-lg px-3 py-2.5 leading-relaxed list-disc list-inside space-y-1">
                    {editTarget.sources.map((s, i) => (
                      <li key={i}>
                        {s.title}
                        {s.section ? ` — ${s.section}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <ScheduleFields
                startLocal={startLocal}
                setStartLocal={setStartLocal}
                durationHours={durationHours}
                setDurationHours={setDurationHours}
              />
              <div>
                <label className="block font-mono text-[11px] text-ink-3 tracking-wide mb-1.5">
                  {t('managerNote').toUpperCase()} <span className="font-normal normal-case">{t('managerNoteOptional')}</span>
                </label>
                <textarea
                  ref={noteRef}
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  rows={3}
                  placeholder={t('managerNotePlaceholder')}
                  className="w-full px-3 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-green/30 transition resize-none placeholder:text-ink-4"
                />
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-line-soft">
              <button onClick={closeEdit} disabled={isSaving}
                className="flex-1 px-4 py-2.5 rounded-lg border border-line text-sm font-medium text-ink hover:border-ink-4 transition-colors disabled:opacity-50">
                {t('cancel')}
              </button>
              <button onClick={handleSaveEdit} disabled={isSaving}
                className="flex-1 bg-green hover:brightness-105 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 disabled:opacity-50">
                {isSaving ? (
                  <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {t('acceptWithChanges')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Schedule dialog (Accept) */}
      {scheduleTarget && (
        <Dialog title={t('scheduleTitle')} onClose={() => setScheduleTarget(null)}>
          <div className="p-5 space-y-4">
            <p className="text-sm font-semibold text-ink">{scheduleTarget.title}</p>
            <ScheduleFields
              startLocal={startLocal}
              setStartLocal={setStartLocal}
              durationHours={durationHours}
              setDurationHours={setDurationHours}
            />
            <p className="text-[13px] text-ink-2 leading-relaxed">{t('scheduleHint')}</p>
          </div>
          <div className="flex gap-3 p-5 border-t border-line-soft">
            <button onClick={() => setScheduleTarget(null)}
              className="flex-1 px-4 py-2.5 rounded-lg border border-line text-sm font-medium text-ink hover:border-ink-4 transition-colors">
              {t('cancel')}
            </button>
            <button onClick={handleConfirmSchedule} disabled={!startLocal}
              className="flex-1 bg-green hover:brightness-105 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50">
              <CalendarClock className="h-4 w-4" />
              {t('schedule')}
            </button>
          </div>
        </Dialog>
      )}

      {/* Skip dialog */}
      {skipTarget && (
        <Dialog title={t('skipTitle')} onClose={() => setSkipTarget(null)}>
          <div className="p-5 space-y-3">
            <p className="text-sm font-semibold text-ink">{skipTarget.title}</p>
            <p className="text-[13px] text-ink-2">{t('skipQuestion')}</p>
            <div className="flex flex-wrap gap-2">
              {(["already_done", "disagree", "no_resources"] as const).map((reason) => (
                <button key={reason} onClick={() => handleSkip(reason)}
                  className="min-h-[44px] px-4 rounded-full border border-line bg-tile text-sm font-medium text-ink hover:border-ink-4 transition-colors">
                  {t(`skipReasons.${reason}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end p-5 border-t border-line-soft">
            <button onClick={() => handleSkip()}
              className="px-4 py-2.5 rounded-lg text-sm font-medium text-ink-2 hover:bg-tile-2 transition-colors">
              {t('skipNoReason')}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/** datetime-local value for the next full hour, in the browser's timezone. */
function nextHourLocal(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

function ScheduleFields({
  startLocal, setStartLocal, durationHours, setDurationHours,
}: {
  startLocal: string;
  setStartLocal: (v: string) => void;
  durationHours: string;
  setDurationHours: (v: string) => void;
}) {
  const t = useTranslations('recommendations');
  return (
    <div className="grid grid-cols-[1fr_110px] gap-3">
      <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">
        {t('startTime')}
        <input type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-green/30" />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">
        {t('durationHours')}
        <input type="number" min="0.5" step="0.5" value={durationHours} onChange={(e) => setDurationHours(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-green/30" />
      </label>
    </div>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label={title}
        className="bg-surface rounded-2xl shadow-2xl w-full max-w-md border border-line overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-line-soft">
          <h2 className="font-heading text-base font-semibold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-ink-3 hover:bg-tile transition-colors">
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
