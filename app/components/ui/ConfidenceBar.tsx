/**
 * Confidence is drawn in a neutral colour. It used to be green at ≥85% and
 * amber below, the same colours as the healthy/watch statuses, so a 79% card
 * read as a warning about the block rather than about the model.
 */
export function confidenceLevel(value: number): "high" | "medium" | "low" {
  return value >= 85 ? "high" : value >= 65 ? "medium" : "low";
}

export function ConfidenceBar({
  value,
  label,
  levelLabel,
  width = "w-[70px]",
  className = "",
}: {
  value: number;
  /** Heading, e.g. "Confidence". */
  label: string;
  /** Translated level word, e.g. "High". */
  levelLabel: string;
  width?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="whitespace-nowrap text-xs text-ink-2">{label}</span>
      <div className={`h-1.5 ${width} overflow-hidden rounded-full bg-line-soft`}>
        <div className="h-full rounded-full bg-ink-2" style={{ width: `${Math.round(value)}%` }} />
      </div>
      <span className="whitespace-nowrap text-xs font-semibold text-ink">
        {levelLabel} · {Math.round(value)}%
      </span>
    </div>
  );
}
