import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export default function AdminSectionCard({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-surface p-8 shadow-sm ring-1 ring-line">
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Icon className="h-5 w-5 text-green" />
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-ink-3">{description}</p>}
      </div>
      {children}
    </section>
  );
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-soft text-green",
  trialing: "bg-blue-soft text-blue",
  past_due: "bg-red-soft text-red",
  canceled: "bg-tile text-ink-3",
  incomplete: "bg-tile text-ink-3",
};

export function SubscriptionStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return <span className="rounded-md bg-tile px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-ink-3">No plan</span>;
  }
  const cfg = STATUS_STYLES[status] ?? "bg-tile text-ink-3";
  return <span className={`rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${cfg}`}>{status.replace("_", " ")}</span>;
}
