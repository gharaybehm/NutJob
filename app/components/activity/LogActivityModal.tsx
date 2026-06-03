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
import {
  logActivity,
  type ActivityLogEntry,
  type ActivityDetails,
  type IrrigationDetails,
  type FertigationDetails,
  type SprayingDetails,
  type ScoutingDetails,
  type PruningDetails,
} from "@/app/[farmId]/(dashboard)/activity/actions";

export interface QueuedActivity {
  id: string;
  title: string;
  activity_type: ActivityLogEntry["activity_type"];
  block_id: string | null;
  description: string | null;
  performed_at: string;
  block_name: string | null;
  saved_at: string;
  details?: ActivityDetails;
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

const DETAIL_TYPES = new Set<ActivityType>(["irrigation", "fertigation", "spraying", "scouting", "pruning"]);

function toLocalISOString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-slate-400 transition";
const labelSmCls = "block text-xs text-slate-500 dark:text-slate-400 mb-1";

export default function LogActivityModal({ blocks, onClose, onSaved, onSavedOffline }: Props) {
  const [activityType, setActivityType] = useState<ActivityType>("irrigation");
  const [blockId, setBlockId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [performedAt, setPerformedAt] = useState(() => toLocalISOString(new Date()));
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Irrigation fields ──────────────────────────────────────────────────────
  const [irrDuration, setIrrDuration] = useState("");
  const [irrVolume, setIrrVolume] = useState("");
  const [irrMethod, setIrrMethod] = useState<IrrigationDetails["method"]>("Drip");

  // ── Fertigation fields ─────────────────────────────────────────────────────
  const [fertProduct, setFertProduct] = useState("");
  const [fertAmount, setFertAmount] = useState("");
  const [fertUnit, setFertUnit] = useState<"kg" | "L">("kg");
  const [fertGrowthNote, setFertGrowthNote] = useState("");

  // ── Spraying fields ────────────────────────────────────────────────────────
  const [sprayProduct, setSprayProduct] = useState("");
  const [sprayRate, setSprayRate] = useState("");
  const [sprayTarget, setSprayTarget] = useState("");
  const [sprayPHI, setSprayPHI] = useState("");

  // ── Scouting fields ────────────────────────────────────────────────────────
  const [scoutRisk, setScoutRisk] = useState<ScoutingDetails["overall_risk"]>("green");
  const [scoutObs, setScoutObs] = useState("");
  const [scoutNext, setScoutNext] = useState("");

  // ── Pruning fields ─────────────────────────────────────────────────────────
  const [pruneType, setPruneType] = useState<PruningDetails["pruning_type"]>("Maintenance");
  const [pruneIntensity, setPruneIntensity] = useState<PruningDetails["intensity"]>("Moderate");

  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const selectedType = ACTIVITY_TYPES.find((t) => t.id === activityType)!;

  function resetDetailFields() {
    setIrrDuration(""); setIrrVolume(""); setIrrMethod("Drip");
    setFertProduct(""); setFertAmount(""); setFertUnit("kg"); setFertGrowthNote("");
    setSprayProduct(""); setSprayRate(""); setSprayTarget(""); setSprayPHI("");
    setScoutRisk("green"); setScoutObs(""); setScoutNext("");
    setPruneType("Maintenance"); setPruneIntensity("Moderate");
  }

  const handleTypeSelect = (type: ActivityType) => {
    setActivityType(type);
    resetDetailFields();
    if (!title || ACTIVITY_TYPES.some((t) => t.label === title)) {
      setTitle(ACTIVITY_TYPES.find((t) => t.id === type)?.label ?? "");
    }
  };

  function buildDetails(): ActivityDetails {
    switch (activityType) {
      case "irrigation":
        return {
          source: "manual", activity: "irrigation",
          ...(irrDuration ? { duration_hours: parseFloat(irrDuration) } : {}),
          ...(irrVolume ? { volume_per_tree_l: parseFloat(irrVolume) } : {}),
          method: irrMethod,
        };
      case "fertigation":
        return {
          source: "manual", activity: "fertigation",
          ...(fertProduct ? { product_name: fertProduct } : {}),
          ...(fertAmount ? { amount_per_tree: parseFloat(fertAmount), amount_unit: fertUnit } : {}),
          ...(fertGrowthNote ? { growth_stage_note: fertGrowthNote } : {}),
        };
      case "spraying":
        return {
          source: "manual", activity: "spraying",
          ...(sprayProduct ? { product_name: sprayProduct } : {}),
          ...(sprayRate ? { rate_l_per_ha: parseFloat(sprayRate) } : {}),
          ...(sprayTarget ? { target: sprayTarget } : {}),
          ...(sprayPHI ? { phi_days: parseInt(sprayPHI, 10) } : {}),
        };
      case "scouting":
        return {
          source: "manual", activity: "scouting",
          overall_risk: scoutRisk,
          ...(scoutObs ? { observations: scoutObs } : {}),
          ...(scoutNext ? { next_scouting: new Date(scoutNext).toISOString() } : {}),
        };
      case "pruning":
        return {
          source: "manual", activity: "pruning",
          pruning_type: pruneType,
          intensity: pruneIntensity,
        };
      default:
        return { source: "manual" };
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }

    setIsSaving(true);
    setError(null);

    const block = blocks.find((b) => b.id === blockId) ?? null;
    const details = buildDetails();
    const payload = {
      title: title.trim(),
      activity_type: activityType,
      block_id: blockId || null,
      description: description.trim() || null,
      performed_at: new Date(performedAt).toISOString(),
      details,
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
                rows={2}
                placeholder="Observations, quantities, conditions…"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-slate-400 resize-none transition"
              />
            </div>

            {/* Activity-specific detail fields */}
            {DETAIL_TYPES.has(activityType) && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Details</p>

                {/* IRRIGATION */}
                {activityType === "irrigation" && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelSmCls}>Duration (hours)</label>
                        <input type="number" min="0" step="0.5" value={irrDuration}
                          onChange={(e) => setIrrDuration(e.target.value)}
                          placeholder="e.g. 4"
                          className={inputCls} />
                      </div>
                      <div>
                        <label className={labelSmCls}>Volume (L/tree)</label>
                        <input type="number" min="0" step="0.1" value={irrVolume}
                          onChange={(e) => setIrrVolume(e.target.value)}
                          placeholder="e.g. 30"
                          className={inputCls} />
                      </div>
                    </div>
                    <div>
                      <label className={labelSmCls}>Method</label>
                      <select value={irrMethod}
                        onChange={(e) => setIrrMethod(e.target.value as IrrigationDetails["method"])}
                        className={inputCls}>
                        {["Drip", "Sprinkler", "Flood", "Surface"].map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {/* FERTIGATION */}
                {activityType === "fertigation" && (
                  <>
                    <div>
                      <label className={labelSmCls}>Product Name</label>
                      <input type="text" value={fertProduct}
                        onChange={(e) => setFertProduct(e.target.value)}
                        placeholder="e.g. Haifa Multi-K"
                        className={inputCls} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelSmCls}>Amount / tree</label>
                        <input type="number" min="0" step="0.01" value={fertAmount}
                          onChange={(e) => setFertAmount(e.target.value)}
                          placeholder="e.g. 0.5"
                          className={inputCls} />
                      </div>
                      <div>
                        <label className={labelSmCls}>Unit</label>
                        <select value={fertUnit}
                          onChange={(e) => setFertUnit(e.target.value as "kg" | "L")}
                          className={inputCls}>
                          <option value="kg">kg / tree</option>
                          <option value="L">L / tree</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className={labelSmCls}>Growth Stage Note (optional)</label>
                      <input type="text" value={fertGrowthNote}
                        onChange={(e) => setFertGrowthNote(e.target.value)}
                        placeholder="e.g. Nut development"
                        className={inputCls} />
                    </div>
                  </>
                )}

                {/* SPRAYING */}
                {activityType === "spraying" && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelSmCls}>Product Name</label>
                        <input type="text" value={sprayProduct}
                          onChange={(e) => setSprayProduct(e.target.value)}
                          placeholder="e.g. Karate Zeon"
                          className={inputCls} />
                      </div>
                      <div>
                        <label className={labelSmCls}>Rate (L/ha)</label>
                        <input type="number" min="0" step="0.1" value={sprayRate}
                          onChange={(e) => setSprayRate(e.target.value)}
                          placeholder="e.g. 600"
                          className={inputCls} />
                      </div>
                    </div>
                    <div>
                      <label className={labelSmCls}>Target pest / disease</label>
                      <input type="text" value={sprayTarget}
                        onChange={(e) => setSprayTarget(e.target.value)}
                        placeholder="e.g. Spider mite"
                        className={inputCls} />
                    </div>
                    <div>
                      <label className={labelSmCls}>PHI (days, optional)</label>
                      <input type="number" min="0" step="1" value={sprayPHI}
                        onChange={(e) => setSprayPHI(e.target.value)}
                        placeholder="e.g. 14"
                        className={inputCls} />
                    </div>
                  </>
                )}

                {/* SCOUTING */}
                {activityType === "scouting" && (
                  <>
                    <div>
                      <label className={labelSmCls}>Overall Risk</label>
                      <div className="flex gap-2 mt-1">
                        {([
                          { value: "green" as const, label: "Low",    cls: "text-green-700 bg-green-100 ring-green-300 dark:bg-green-900/40 dark:text-green-300 dark:ring-green-700" },
                          { value: "amber" as const, label: "Medium", cls: "text-amber-700 bg-amber-100 ring-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:ring-amber-700" },
                          { value: "red"   as const, label: "High",   cls: "text-red-700 bg-red-100 ring-red-300 dark:bg-red-900/40 dark:text-red-300 dark:ring-red-700" },
                        ]).map((opt) => (
                          <button key={opt.value} type="button"
                            onClick={() => setScoutRisk(opt.value)}
                            className={`flex-1 py-2 rounded-lg text-xs font-medium ring-1 transition-all ${
                              scoutRisk === opt.value
                                ? `${opt.cls} ring-2 scale-[1.03]`
                                : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-slate-200 dark:ring-slate-700"
                            }`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className={labelSmCls}>Observations</label>
                      <textarea value={scoutObs} onChange={(e) => setScoutObs(e.target.value)} rows={2}
                        placeholder="Pest name, count, stage…"
                        className={`${inputCls} resize-none`} />
                    </div>
                    <div>
                      <label className={labelSmCls}>Next Scouting Date (optional)</label>
                      <input type="date" value={scoutNext}
                        onChange={(e) => setScoutNext(e.target.value)}
                        className={inputCls} />
                    </div>
                  </>
                )}

                {/* PRUNING */}
                {activityType === "pruning" && (
                  <>
                    <div>
                      <label className={labelSmCls}>Pruning Type</label>
                      <select value={pruneType}
                        onChange={(e) => setPruneType(e.target.value as PruningDetails["pruning_type"])}
                        className={inputCls}>
                        {["Formative", "Maintenance", "Summer", "Renovation"].map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelSmCls}>Intensity</label>
                      <div className="flex gap-2 mt-1">
                        {(["Low", "Moderate", "Heavy"] as const).map((level) => (
                          <button key={level} type="button"
                            onClick={() => setPruneIntensity(level)}
                            className={`flex-1 py-2 rounded-lg text-xs font-medium ring-1 transition-all ${
                              pruneIntensity === level
                                ? "bg-amber-100 text-amber-700 ring-amber-300 ring-2 scale-[1.03] dark:bg-amber-900/40 dark:text-amber-300 dark:ring-amber-700"
                                : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-slate-200 dark:ring-slate-700"
                            }`}>
                            {level}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

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
