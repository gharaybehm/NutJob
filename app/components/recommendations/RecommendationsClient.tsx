"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import RecommendationCard from "./RecommendationCard";
import { updateRecommendationStatus, generateMockRecommendations } from "@/app/(dashboard)/recommendations/actions";
import { 
  Sparkles, 
  Filter,
  CheckCircle2,
  Clock,
  XCircle,
  Activity
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
  blocks?: { name: string } | null;
  created_at: string;
}

interface Props {
  initialRecommendations: Recommendation[];
}

const CATEGORIES: { id: Category | "all", label: string }[] = [
  { id: "all", label: "All Types" },
  { id: "irrigate", label: "Irrigate" },
  { id: "fertilize", label: "Fertilize" },
  { id: "spray", label: "Spray" },
  { id: "scout", label: "Scout" },
  { id: "prune", label: "Prune" },
];

export default function RecommendationsClient({ initialRecommendations }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<"pending" | "acted">("pending");
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");

  const handleStatusUpdate = async (id: string, newStatus: Status) => {
    setProcessingIds(prev => new Set(prev).add(id));
    
    try {
      await updateRecommendationStatus(id, newStatus);
      // Wait for revalidation
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      console.error("Failed to update status:", error);
      alert("Failed to update recommendation status. Please try again.");
    } finally {
      // Remove from processing after a short delay to prevent UI flicker
      setTimeout(() => {
        setProcessingIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 500);
    }
  };

  const handleGenerateMock = async () => {
    setProcessingIds(prev => new Set(prev).add("generate"));
    try {
      await generateMockRecommendations();
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      console.error("Failed to generate mock data:", error);
      alert("Failed to generate mock data. Ensure blocks exist first.");
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete("generate");
        return next;
      });
    }
  };

  // Apply filters
  const filteredRecommendations = initialRecommendations.filter(rec => {
    const matchesStatus = statusFilter === "pending" 
      ? rec.status === "pending" 
      : rec.status !== "pending";
      
    const matchesCategory = categoryFilter === "all" || rec.category === categoryFilter;
    
    return matchesStatus && matchesCategory;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header & Controls */}
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
            Pending
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
            History
          </button>
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-slate-400 shrink-0 ml-1" />
          <select 
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as any)}
            className="bg-slate-50 dark:bg-slate-800 border-none text-sm font-medium text-slate-700 dark:text-slate-300 rounded-lg py-2 pl-3 pr-8 focus:ring-2 focus:ring-brand-500 cursor-pointer"
          >
            {CATEGORIES.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid of Cards */}
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
              onAccept={(id) => handleStatusUpdate(id, "accepted")}
              onSkip={(id) => handleStatusUpdate(id, "skipped")}
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
            No {statusFilter} recommendations
          </h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-8 leading-relaxed">
            {statusFilter === "pending" 
              ? "The AI engine hasn't generated any new actionable insights for your blocks at this time." 
              : "You haven't accepted or skipped any recommendations yet."}
          </p>
          
          {/* Mock generation button (dev only/empty state fallback) */}
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
            Generate Mock Insights
          </button>
        </div>
      )}
    </div>
  );
}
