import React from "react";
import { 
  Droplets, 
  FlaskConical, 
  ShieldAlert, 
  Search, 
  Scissors, 
  Lightbulb,
  Check,
  X,
  Edit2
} from "lucide-react";

type Category = "irrigate" | "fertilize" | "spray" | "scout" | "prune" | "other";
type Status = "pending" | "accepted" | "edited" | "skipped";

interface RecommendationCardProps {
  id: string;
  category: Category;
  title: string;
  rationale: string;
  confidence: number | null;
  status: Status;
  blockName?: string;
  managerNote?: string | null;
  onAccept: (id: string) => void;
  onSkip: (id: string) => void;
  onEdit: (id: string) => void;
  isProcessing?: boolean;
}

export default function RecommendationCard({
  id,
  category,
  title,
  rationale,
  confidence,
  status,
  blockName,
  managerNote,
  onAccept,
  onSkip,
  onEdit,
  isProcessing = false
}: RecommendationCardProps) {
  
  const getCategoryIcon = (cat: Category) => {
    switch (cat) {
      case "irrigate": return <Droplets className="h-5 w-5" />;
      case "fertilize": return <FlaskConical className="h-5 w-5" />;
      case "spray": return <ShieldAlert className="h-5 w-5" />;
      case "scout": return <Search className="h-5 w-5" />;
      case "prune": return <Scissors className="h-5 w-5" />;
      default: return <Lightbulb className="h-5 w-5" />;
    }
  };

  const getCategoryColor = (cat: Category) => {
    switch (cat) {
      case "irrigate": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "fertilize": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "spray": return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
      case "scout": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      case "prune": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
      default: return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400";
    }
  };

  // confidence is stored as 0.0–1.0 in the DB
  const confidencePct = confidence !== null ? Math.round(confidence * 100) : null;

  const getConfidenceColor = (pct: number | null) => {
    if (pct === null) return "text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400";
    if (pct >= 90) return "text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400";
    if (pct >= 75) return "text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400";
    return "text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400";
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col transition-all hover:shadow-md">
      <div className="p-5 flex-1">
        <div className="flex justify-between items-start mb-3">
          <div className={`p-2 rounded-lg ${getCategoryColor(category)}`}>
            {getCategoryIcon(category)}
          </div>
          {confidencePct !== null && (
            <div className={`text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1 ${getConfidenceColor(confidencePct)}`}>
              {confidencePct}% Match
            </div>
          )}
        </div>
        
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
          {title}
        </h3>
        
        {blockName && (
          <div className="text-sm font-medium text-brand-600 dark:text-brand-400 mb-3">
            Target: {blockName}
          </div>
        )}
        
        <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed">
          {rationale}
        </p>
      </div>
      
      {status === "pending" ? (
        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 border-t border-slate-100 dark:border-slate-800 flex gap-2">
          <button
            onClick={() => onAccept(id)}
            disabled={isProcessing}
            className="flex-1 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            Accept
          </button>
          <button
            onClick={() => onEdit(id)}
            disabled={isProcessing}
            className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            title="Edit"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => onSkip(id)}
            disabled={isProcessing}
            className="bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-600 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            title="Skip"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium flex items-center gap-1.5 ${
              status === 'accepted' ? 'text-emerald-600 dark:text-emerald-400' :
              status === 'skipped' ? 'text-slate-500 dark:text-slate-400' :
              'text-amber-600 dark:text-amber-400'
            }`}>
              {status === 'accepted' && <Check className="h-4 w-4" />}
              {status === 'skipped' && <X className="h-4 w-4" />}
              {status === 'edited' && <Edit2 className="h-4 w-4" />}
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">Logged</span>
          </div>
          {managerNote && (
            <p className="text-xs text-slate-600 dark:text-slate-400 italic border-l-2 border-slate-300 dark:border-slate-600 pl-2">
              &quot;{managerNote}&quot;
            </p>
          )}
        </div>
      )}
    </div>
  );
}
