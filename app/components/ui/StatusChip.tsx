type StatusVariant =
  | "healthy" | "watch" | "critical"
  | "good" | "on-track" | "alert"
  | "ok" | "low" | "due"
  | "logged" | "completed" | "pending" | "auto";

const STATUS_STYLES: Record<StatusVariant, { bg: string; text: string; label: string }> = {
  healthy:    { bg: "bg-green-soft",  text: "text-green",  label: "Healthy" },
  "on-track": { bg: "bg-green-soft",  text: "text-green",  label: "On Track" },
  good:       { bg: "bg-green-soft",  text: "text-green",  label: "Good" },
  ok:         { bg: "bg-green-soft",  text: "text-green",  label: "OK" },
  logged:     { bg: "bg-green-soft",  text: "text-green",  label: "Logged" },
  watch:      { bg: "bg-amber-soft",  text: "text-amber",  label: "Watch" },
  pending:    { bg: "bg-amber-soft",  text: "text-amber",  label: "Pending" },
  due:        { bg: "bg-amber-soft",  text: "text-amber",  label: "Due" },
  critical:   { bg: "bg-red-soft",    text: "text-red",    label: "Critical" },
  alert:      { bg: "bg-red-soft",    text: "text-red",    label: "Alert" },
  low:        { bg: "bg-red-soft",    text: "text-red",    label: "Low" },
  completed:  { bg: "bg-blue-soft",   text: "text-blue",   label: "Completed" },
  auto:       { bg: "bg-tile-2",      text: "text-ink-3",  label: "Auto" },
};

export function StatusChip({
  status,
  label,
  className = "",
}: {
  status: StatusVariant;
  label?: string;
  className?: string;
}) {
  const cfg = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide ${cfg.bg} ${cfg.text} ${className}`}
    >
      {(label ?? cfg.label).toUpperCase()}
    </span>
  );
}
