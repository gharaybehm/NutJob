"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import RecommendationCard from "./RecommendationCard";
import {
  updateRecommendationStatus,
  editRecommendation,
  generateAIRecommendations,
  generateMockRecommendations,
} from "@/app/(dashboard)/recommendations/actions";
import {
  Sparkles,
  Filter,
  CheckCircle2,
  Clock,
  Activity,
  X as XIcon,
  Edit2,
  Cpu,
} from "lucide-react";

type Category = "irrigate" | "fertilize" | "spray" | "scout" | "prune" | "other";
type Status = "pending" | "accepted" | "edited" | "skipped";

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
}

interface Props {
  initialRecommendations: Recommendation[];
  farmId?: string;
}

interface EditTarget {
  id: string;
  title: string;
  rationale: string;
  blockName?: string;
}

export default function RecommendationsClient({ initialRecommendations, farmId: _farmId }: Props) {
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

  const openEdit = (rec: Recommendation) => {
    setEditTarget({ id: rec.id, title: rec.title, rationale: rec.rationale, blockName: rec.blocks?.name });
    setEditTitle(rec.title);
    setEditNote("");
  };

  const closeEdit = () => { setEditTarget(null); setEditTitle(""); setEditNote(""); };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setIsSaving(true);
    try {
      await editRecommendation(editTarget.id, {
        title: editTitle.trim() || editTarget.title,
        manager_note: editNote.trim() || undefined,
      });
      startTransition(() => { router.refresh(); });
      closeEdit();
    } catch (error) {
      console.error("Failed to save edit:", error);
      alert("Failed to save changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusUpdate = async (id: string, newStatus: Status) => {
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      await updateRecommendationStatus(id, newStatus);
      startTransition(() => { router.refresh(); });
    } catch (error) {
      console.error("Failed to update status:", error);
      alert("Failed to update recommendation status. Please try again.");
    } finally {
      setTimeout(() => {
        setProcessingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      }, 500);
    }
  };

  const handleGenerateAI = async () => {
    setProcessingIds((prev) => new Set(prev).add("ai-generate"));
    try {
      const result = await generateAIRecommendations();
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
      await generateMockRecommendations();
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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Status Toggle */}
        <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            onClick={() => setStatusFilter("pending")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              statusFilter === "pending"
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Clock className="h-4 w-4" />
            {t('pending')}
          </button>
          <button
            onClick={() => setStatusFilter("acted")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              statusFilter === "acted"
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
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
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
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
          <Filter className="h-4 w-4 text-slate-400 shrink-0 ms-1" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as Category | "all")}
            className="bg-slate-50 dark:bg-slate-800 border-none text-sm font-medium text-slate-700 dark:text-slate-300 rounded-lg py-2 ps-3 pe-8 focus:ring-2 focus:ring-brand-500 cursor-pointer"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.label}</option>
            ))}
          </select>
        </div>
      </div>

      {filteredRecommendations.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
              onAccept={(id) => handleStatusUpdate(id, "accepted")}
              onSkip={(id) => handleStatusUpdate(id, "skipped")}
              onEdit={() => openEdit(rec)}
              isProcessing={processingIds.has(rec.id) || isPending}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
          <div className="h-16 w-16 bg-brand-50 dark:bg-brand-900/30 rounded-full flex items-center justify-center mb-4">
            <Activity className="h-8 w-8 text-brand-600 dark:text-brand-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            {statusFilter === "pending" ? t('noPending') : t('noHistory')}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-8 leading-relaxed">
            {statusFilter === "pending" ? t('pendingDesc') : t('historyDesc')}
          </p>
          <button
            onClick={handleGenerateMock}
            disabled={processingIds.has("generate") || isPending}
            className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 px-6 py-3 rounded-lg font-medium shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processingIds.has("generate") ? (
              <div className="h-5 w-5 border-2 border-slate-500 border-t-white dark:border-t-slate-900 rounded-full animate-spin" />
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold">
                <Edit2 className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                {t('editTitle')}
              </div>
              <button onClick={closeEdit} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {editTarget.blockName && (
                <p className="text-sm font-medium text-brand-600 dark:text-brand-400">
                  {t('target', { name: editTarget.blockName })}
                </p>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  {t('actionTitle')}
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  {t('aiRationale')}
                </label>
                <p className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-3 py-2.5 leading-relaxed">
                  {editTarget.rationale}
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  {t('managerNote')} <span className="font-normal normal-case">{t('managerNoteOptional')}</span>
                </label>
                <textarea
                  ref={noteRef}
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  rows={3}
                  placeholder={t('managerNotePlaceholder')}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition resize-none placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-slate-100 dark:border-slate-800">
              <button onClick={closeEdit} disabled={isSaving}
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">
                {t('cancel')}
              </button>
              <button onClick={handleSaveEdit} disabled={isSaving}
                className="flex-1 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
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
    </div>
  );
}
