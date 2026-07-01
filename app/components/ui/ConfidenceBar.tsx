export function ConfidenceBar({
  value,
  width = "w-[70px]",
  className = "",
}: {
  value: number;
  width?: string;
  className?: string;
}) {
  const good = value >= 85;
  const fill = good ? "bg-green" : "bg-amber";
  const text = good ? "text-green" : "text-amber";
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="font-mono text-[10px] text-ink-3">CONFIDENCE</span>
      <div className={`h-1.5 ${width} overflow-hidden rounded-full bg-line-soft`}>
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.round(value)}%` }} />
      </div>
      <span className={`font-heading text-xs font-semibold ${text}`}>{Math.round(value)}%</span>
    </div>
  );
}
