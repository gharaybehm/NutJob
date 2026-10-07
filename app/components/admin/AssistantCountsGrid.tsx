import type { AssistantCounts } from "@/utils/assistant/operator-counts";

// The operator's view of the field assistant: counts only.

const DECLINE_LABELS: Record<string, string> = {
  veterinary: "veterinary",
  medical: "medical",
  legal: "legal",
  financial: "financial",
  circumvention: "getting round the rules",
  pesticide_no_regulatory: "pesticide product or dose",
  off_topic: "off topic",
};

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg bg-tile px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-4">{hint}</p>}
    </div>
  );
}

export default function AssistantCountsGrid({ counts }: { counts: AssistantCounts }) {
  const declineText = Object.entries(counts.declinesByCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${DECLINE_LABELS[c] ?? c} ${n}`)
    .join(", ");
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Questions" value={counts.questions} />
        <Stat label="Answers without a source" value={counts.unsourced} />
        <Stat label="Declined" value={counts.declines} />
        <Stat label="Guide requests" value={counts.guidesRequested} />
        <Stat label="Drafts accepted" value={counts.draftsAccepted} />
        <Stat label="Drafts dismissed" value={counts.draftsDismissed} />
        <Stat label="Shared with support" value={counts.sharesCreated} hint={`${counts.shareViews} view${counts.shareViews === 1 ? "" : "s"} by support`} />
        <Stat label="Errors" value={counts.errors} hint={`${counts.retries} retried, ${counts.fallbacks} on the fallback model`} />
      </div>
      {declineText && <p className="mt-3 text-sm text-ink-2">Declines by reason: {declineText}</p>}
    </>
  );
}
