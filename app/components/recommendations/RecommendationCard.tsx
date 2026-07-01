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
import { useTranslations } from "next-intl";
import { CATEGORY_STYLES, type Category } from "@/app/components/ui/CategoryChip";
import { ConfidenceBar } from "@/app/components/ui/ConfidenceBar";

type Status = "pending" | "accepted" | "edited" | "skipped";
type CardCategory = Category | "other";

const FALLBACK_STYLE = { bg: "bg-tile-2", text: "text-ink-2", dot: "bg-ink-3", label: "Other" };

interface RecommendationCardProps {
  id: string;
  category: CardCategory;
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

const CATEGORY_ICONS: Record<Category, React.ReactNode> = {
  irrigate: <Droplets className="h-5 w-5" />,
  fertilize: <FlaskConical className="h-5 w-5" />,
  spray: <ShieldAlert className="h-5 w-5" />,
  scout: <Search className="h-5 w-5" />,
  prune: <Scissors className="h-5 w-5" />,
};

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
  const t = useTranslations('recommendations');

  const cfg = category in CATEGORY_STYLES ? CATEGORY_STYLES[category as Category] : FALLBACK_STYLE;
  const icon = category in CATEGORY_ICONS ? CATEGORY_ICONS[category as Category] : <Lightbulb className="h-5 w-5" />;
  const confidencePct = confidence !== null ? Math.round(confidence * 100) : null;

  const STATUS_LABEL: Record<Status, string> = {
    accepted: t('statusAccepted'),
    skipped:  t('statusSkipped'),
    edited:   t('statusEdited'),
    pending:  '',
  };

  return (
    <div className="bg-surface rounded-2xl border border-line overflow-hidden flex flex-col transition-all hover:border-ink-4">
      <div className="p-[18px] flex-1">
        <div className="flex justify-between items-start gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-10 w-10 items-center justify-center rounded-[11px] ${cfg.bg} ${cfg.text}`}>
              {icon}
            </div>
            {blockName && (
              <span className="font-mono text-[10px] text-ink-3">{blockName.toUpperCase()}</span>
            )}
          </div>
          <span className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[9.5px] font-semibold tracking-wide ${cfg.bg} ${cfg.text}`}>
            {cfg.label.toUpperCase()}
          </span>
        </div>

        <h3 className="font-heading text-[14.5px] font-semibold text-ink mb-1">{title}</h3>

        <p className="text-[12.5px] text-ink-2 line-clamp-3 leading-relaxed">{rationale}</p>
      </div>

      {status === "pending" ? (
        <div className="flex items-center justify-between px-[18px] py-3.5 border-t border-line-soft">
          {confidencePct !== null ? (
            <ConfidenceBar value={confidencePct} />
          ) : <span />}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onSkip(id)}
              disabled={isProcessing}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-ink-3 hover:bg-tile-2 transition-colors disabled:opacity-50"
            >
              {t('skip')}
            </button>
            <button
              onClick={() => onEdit(id)}
              disabled={isProcessing}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-ink border border-line hover:border-ink-4 transition-colors disabled:opacity-50"
            >
              {t('edit')}
            </button>
            <button
              onClick={() => onAccept(id)}
              disabled={isProcessing}
              className="flex items-center gap-1.5 bg-green hover:brightness-105 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50"
            >
              <Check className="h-[15px] w-[15px]" />
              {t('accept')}
            </button>
          </div>
        </div>
      ) : (
        <div className="px-[18px] py-3.5 border-t border-line-soft space-y-2">
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium flex items-center gap-1.5 ${
              status === 'accepted' ? 'text-green' :
              status === 'skipped' ? 'text-ink-3' :
              'text-amber'
            }`}>
              {status === 'accepted' && <Check className="h-4 w-4" />}
              {status === 'skipped' && <X className="h-4 w-4" />}
              {status === 'edited' && <Edit2 className="h-4 w-4" />}
              {STATUS_LABEL[status]}
            </span>
            <span className="text-xs text-ink-4">{t('logged')}</span>
          </div>
          {managerNote && (
            <p className="text-xs text-ink-2 italic border-s-2 border-line ps-2">
              &quot;{managerNote}&quot;
            </p>
          )}
        </div>
      )}
    </div>
  );
}
