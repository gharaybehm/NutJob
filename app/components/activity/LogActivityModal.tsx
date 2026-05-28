"use client";

import { useState, useRef, useEffect } from "react";
import {
  X,
  Loader2,
  ClipboardPen,
  Droplets,
  Leaf,
  Bug,
  Scissors,
  FlaskConical,
  Activity,
  Sprout,
  WifiOff,
} from "lucide-react";
import { logActivity, type ActivityLogEntry } from "@/app/(dashboard)/activity/actions";

interface QueuedActivity {
  id: string;
  title: string;
  activity_type: ActivityLogEntry["activity_type"];
  block_id: string | null;
  description: string | null;
  performed_at: string;
  block_name: string | null;
  saved_at: string;
}

type ActivityType = ActivityLogEntry["activity_type"];

interface Block {
  id: string;
  name: string;
}

interface Props {
  blocks: Block[];
  onClose: () => void;
  onSaved: (entry: ActivityLogEntry) => void;
  onSavedOffline: (entry: ActivityLogEntry, queued: QueuedActivity) => void;
}

const ACTIVITY_TYPES: { id: ActivityType; label: string; icon: React.ElementType; color: string }[] = [
  { id: "irrigation",    label: "Irrigation",    icon: Droplets,     color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 ring-blue-300 dark:ring-blue-700" },
  { id: "fertigation",   label: "Fertigation",   icon: Leaf,         color: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 ring-green-300 dark:ring-green-700" },
  { id: "spraying",      label: "Spraying",      icon: Bug,          color: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 ring-red-300 dark:ring-red-700" },
  { id: "pruning",       label: "Pruning",       icon: Scissors,     color: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 ring-amber-300 dark:ring-amber-700" },
  { id: "scouting",      label: "Scouting",      icon: Sprout,       color: "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300 ring-teal-300 dark:ring-teal-700" },
  { id: "tissue-sample", label: "Tissue Sample", icon: FlaskConical, color: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 ring-purple-300 dark:ring-purple-700" },
  { id: "weeding",       label: "Weeding",       icon: Scissors,     color: "bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300 ring-lime-300 dark:ring-lime-700" },
  { id: "pollinating",   label: "Pollinating",   icon: Sprout,       color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300 ring-yellow-300 dark:ring-yellow-700" },
  { id: "tilling",       label: "Tilling",       icon: Activity,     color: "bg-stone-100 text-stone-700 dark:bg-stone-900/50 dark:text-stone-300 ring-stone-300 dark:ring-stone-700" },
  { id: "plowing",       label: "Plowing",       icon: Activity,     color: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300 ring-rose-300 dark:ring-rose-700" },
  { id: "other",         label: "Other",         icon: Activity,     color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 ring-slate-300 dark:ring-slate-600" },
];

// Returns local datetime string suitable for <input type="datetime-local">
function toLocalISOString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function LogActivityModal({ blocks, onClose, onSaved, onSavedOffline }: Props) {
  const [activityType, setActivityType] = useState<ActivityType>("irrigation");
  const [blockId, setBlockId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [performedAt, setPerformedAt] = useState(() => toLocalISOString(new Date()));
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Auto-fill a sensible title when activity type changes, if user hasn't typed one
  const selectedType = ACTIVITY_TYPES.find((t) => t.id === activityType)!;

  const handleTypeSelect = (type: ActivityType) => {
    setActivityType(type);
    if (!title || ACTIVITY_TYPES.some((t) => t.label === title)) {
      setTitle(ACTIVITY_TYPES.find((t) => t.id === type)?.label ?? "");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }

    setIsSaving(true);
    setError(null);

    const block = blocks.find((b) => b.id === blockId) ?? null;
    const payload = {
      title: title.trim(),
      activity_type: activityType,
      block_id: blockId || null,
      description: description.trim() || null,
      performed_at: new Date(performedAt).toISOString(),
    };

    // ── Offline path ──────────────────────────────────────────────────────────
    if (!navigator.onLine) {
      const pendingId = `pending_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const fakeEntry: ActivityLogEntry = {
        id: pendingId,
        ...payload,
        blocks: block ? { name: block.name } : null,
        created_at: new Date().toISOString(),
        performed_by: null,
      };
      const queued: QueuedActivity = {
        id: pendingId,
        ...payload,
        block_name: block?.name ?? null,
        saved_at: new Date().toISOString(),
      };
      onSavedOffline(fakeEntry, queued);
      onClose();
      setIsSaving(false);
      return;
    }

    // ── Online path ───────────────────────────────────────────────────────────
    try {
      const result = await logActivity(payload);
      onSaved({
        id: result.id,
        ...payload,
        blocks: block ? { name: block.name } : null,
        created_at: new Date().toISOString(),
        performed_by: null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 text-slate-900 dark:text-white font-semibold">
            <ClipboardPen className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            Log Activity
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">

            {/* Activity type grid */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Activity Type
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {ACTIVITY_TYPES.map((t) => {
                  const Icon = t.icon;
                  const isSelected = activityType === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleTypeSelect(t.id)}
                      className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl text-xs font-medium transition-all ring-1 ${
                        isSelected
                          ? `${t.color} ring-2 shadow-sm scale-[1.02]`
                          : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-slate-200 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${isSelected ? "" : "opacity-70"}`} />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Title */}
            <div>
              <label htmlFor="log-title" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                id="log-title"
                ref={titleRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`e.g. ${selectedType.label} — Block A`}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-slate-400 transition"
              />
            </div>

            {/* Block + Date row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="log-block" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Block <span className="font-normal normal-case text-slate-400">(optional)</span>
                </label>
                <select
                  id="log-block"
                  value={blockId}
                  onChange={(e) => setBlockId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition"
                >
                  <option value="">All / Farm-wide</option>
                  {blocks.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="log-date" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Date &amp; Time
                </label>
                <input
                  id="log-date"
                  type="datetime-local"
                  value={performedAt}
                  onChange={(e) => setPerformedAt(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="log-notes" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                Notes <span className="font-normal normal-case text-slate-400">(optional)</span>
              </label>
              <textarea
                id="log-notes"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Observations, quantities, conditions…"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-slate-400 resize-none transition"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800/50 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !title.trim()}
              className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : typeof window !== "undefined" && !navigator.onLine ? (
                <WifiOff className="h-4 w-4" />
              ) : (
                <ClipboardPen className="h-4 w-4" />
              )}
              {isSaving ? "Saving…" : typeof window !== "undefined" && !navigator.onLine ? "Save Offline" : "Save Activity"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
