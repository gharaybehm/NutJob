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
  Edit2,
  BookOpen,
  BookDashed,
  CalendarClock,
  CalendarCheck,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CATEGORY_STYLES, type Category } from "@/app/components/ui/CategoryChip";
import { ConfidenceBar, confidenceLevel } from "@/app/components/ui/ConfidenceBar";
import { AskAssistantButton } from "@/app/components/assistant/AssistantButton";

type Status = "pending" | "accepted" | "edited" | "skipped";
type CardCategory = Category | "other";

const FALLBACK_STYLE = { bg: "bg-tile-2", text: "text-ink-2", dot: "bg-ink-3", label: "Other" };

interface RecommendationSource {
  title: string;
  section: string | null;
}

interface RecommendationCardProps {
  id: string;
  category: CardCategory;
  title: string;
  rationale: string;
  confidence: number | null;
  status: Status;
  blockName?: string;
  managerNote?: string | null;
  sources?: RecommendationSource[] | null;
  /** What the knowledge-base lookup found when this was generated. Null on older cards. */
  referenceStatus?: string | null;
  /** The calendar event an accepted recommendation booked, if any. */
  scheduledEvent?: { start_date: string; completed_at: string | null } | null;
  /** Set once the work was logged as done. */
  activityLogId?: string | null;
  /** Pending but replaced by a newer batch or past its expiry. */
  expired?: boolean;
  farmId: string;
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
  sources,
  referenceStatus,
  scheduledEvent,
  activityLogId,
  expired = false,
  farmId,
  onAccept,
  onSkip,
  onEdit,
  isProcessing = false
}: RecommendationCardProps) {
  const t = useTranslations('recommendations');

  const cfg = category in CATEGORY_STYLES ? CATEGORY_STYLES[category as Category] : FALLBACK_STYLE;
  const icon = category in CATEGORY_ICONS ? CATEGORY_ICONS[category as Category] : <Lightbulb className="h-5 w-5" />;
  const confidencePct = confidence !== null ? Math.round(confidence * 100) : null;

  const isDone = Boolean(activityLogId || scheduledEvent?.completed_at);
  const isScheduled = (status === "accepted" || status === "edited") && !isDone && Boolean(scheduledEvent);
  const skipReason = status === "skipped" && managerNote?.startsWith("skip_reason:")
    ? managerNote.slice("skip_reason:".length)
    : null;
  const visibleNote = skipReason ? null : managerNote;

  const formatWhen = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  let statusLabel = "";
  if (status === "pending" && expired) {
    statusLabel = t('statusExpired');
  } else if (status === "skipped") {
    statusLabel = skipReason && ["already_done", "disagree", "no_resources"].includes(skipReason)
      ? `${t('statusSkipped')} · ${t(`skipReasons.${skipReason as "already_done" | "disagree" | "no_resources"}`)}`
      : t('statusSkipped');
  } else if (isDone) {
    statusLabel = t('statusDone');
  } else if (isScheduled && scheduledEvent) {
    statusLabel = t('statusScheduled', { date: formatWhen(scheduledEvent.start_date) });
  } else if (status === "accepted") {
    statusLabel = t('statusAccepted');
  } else if (status === "edited") {
    statusLabel = t('statusEdited');
  }

  return (
    <div className="bg-surface rounded-2xl border border-line overflow-hidden flex flex-col transition-all hover:border-ink-4">
      <div className="p-[18px] flex-1">
        <div className="flex justify-between items-start gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-10 w-10 items-center justify-center rounded-[11px] ${cfg.bg} ${cfg.text}`}>
              {icon}
            </div>
            {blockName && (
              <span className="font-heading text-[13px] font-bold text-ink">{blockName}</span>
            )}
          </div>
          <span className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wide ${cfg.bg} ${cfg.text}`}>
            {(category in CATEGORY_STYLES ? t(`categories.${category as Category}`) : cfg.label).toUpperCase()}
          </span>
        </div>

        <h3 className="font-heading text-[14.5px] font-semibold text-ink mb-1">{title}</h3>

        <p className="text-[12.5px] text-ink-2 line-clamp-3 leading-relaxed">{rationale}</p>

        {sources && sources.length > 0 && (
          <p className="mt-1.5 text-[11px] text-ink-4 flex items-center gap-1">
            <BookOpen className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {sources[0].title}
              {sources[0].section ? ` — ${sources[0].section}` : ""}
              {sources.length > 1 ? ` +${sources.length - 1} more` : ""}
            </span>
          </p>
        )}
        {(!sources || sources.length === 0) && (
          <p className={`mt-1.5 text-[11px] flex items-center gap-1 ${
            referenceStatus === "none_loaded" || referenceStatus === "error" ? "text-amber-ink" : "text-ink-4"
          }`}>
            <BookDashed className="h-3 w-3 shrink-0" />
            <span>
              {t('notSourceBacked')}
              {referenceStatus === "none_loaded" || referenceStatus === "error"
                ? `: ${t(`referenceReasons.${referenceStatus}`)}`
                : referenceStatus === "no_match" || referenceStatus === "found"
                  ? `: ${t('referenceReasons.no_match')}`
                  : ""}
            </span>
          </p>
        )}
        <AskAssistantButton pins={{ recommendationId: id }} className="mt-2.5" />
      </div>

      {status === "pending" && !expired ? (
        <div className="px-[18px] pt-3 pb-3.5 border-t border-line-soft space-y-2.5">
          {confidencePct !== null && (
            <ConfidenceBar
              value={confidencePct}
              label={t('confidence')}
              levelLabel={t(`confidenceLevel.${confidenceLevel(confidencePct)}`)}
            />
          )}
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => onSkip(id)}
              disabled={isProcessing}
              className="px-3 py-2 rounded-lg text-[13px] font-semibold text-ink-2 hover:bg-tile-2 transition-colors disabled:opacity-50"
            >
              {t('skipEllipsis')}
            </button>
            <button
              onClick={() => onEdit(id)}
              disabled={isProcessing}
              className="px-3 py-2 rounded-lg text-[13px] font-semibold text-ink border border-line hover:border-ink-4 transition-colors disabled:opacity-50"
            >
              {t('edit')}
            </button>
            <button
              onClick={() => onAccept(id)}
              disabled={isProcessing}
              className="flex items-center gap-1.5 bg-green hover:brightness-105 text-white px-3 py-2 rounded-lg text-[13px] font-semibold transition disabled:opacity-50"
            >
              <CalendarCheck className="h-[15px] w-[15px]" />
              {t('acceptAndSchedule')}
            </button>
          </div>
        </div>
      ) : (
        <div className="px-[18px] py-3.5 border-t border-line-soft space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-sm font-medium flex items-center gap-1.5 ${
              isDone ? 'text-green' :
              isScheduled ? 'text-blue-ink' :
              status === 'skipped' || expired ? 'text-ink-2' :
              'text-amber-ink'
            }`}>
              {isDone && <Check className="h-4 w-4" />}
              {isScheduled && <CalendarClock className="h-4 w-4" />}
              {status === 'skipped' && <X className="h-4 w-4" />}
              {expired && <Clock className="h-4 w-4" />}
              {!isDone && !isScheduled && status === 'edited' && <Edit2 className="h-4 w-4" />}
              {statusLabel}
            </span>
            {isScheduled && (
              <Link href={`/${farmId}/calendar`} className="text-[13px] font-semibold text-green hover:underline shrink-0">
                {t('logWhatWasDone')}
              </Link>
            )}
          </div>
          {visibleNote && (
            <p className="text-xs text-ink-2 italic border-s-2 border-line ps-2">
              &quot;{visibleNote}&quot;
            </p>
          )}
        </div>
      )}
    </div>
  );
}
