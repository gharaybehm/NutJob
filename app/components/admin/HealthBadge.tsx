import type { HealthLevel } from "@/utils/farm-health";

const HEALTH_STYLES: Record<HealthLevel, { label: string; className: string }> = {
  healthy: { label: "Healthy", className: "bg-green-soft text-green" },
  attention: { label: "Needs attention", className: "bg-amber-soft text-amber-ink" },
  stalled: { label: "Stalled", className: "bg-red-soft text-red" },
  not_set_up: { label: "Not set up", className: "bg-tile text-ink-3" },
};

export default function HealthBadge({ level }: { level: HealthLevel }) {
  const cfg = HEALTH_STYLES[level];
  return <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${cfg.className}`}>{cfg.label}</span>;
}
