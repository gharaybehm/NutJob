import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { getCrossFarmOverview } from "@/app/(superadmin)/admin/actions";
import AdminSectionCard, { SubscriptionStatusBadge } from "@/app/components/admin/AdminSectionCard";
import HealthBadge from "@/app/components/admin/HealthBadge";
import { describeAge, type HealthLevel } from "@/utils/farm-health";

// Farms that need a look come first.
const LEVEL_ORDER: HealthLevel[] = ["stalled", "attention", "not_set_up", "healthy"];

export default async function AdminOverviewPage() {
  const { farms, error } = await getCrossFarmOverview();
  const now = new Date();
  const sorted = [...(farms ?? [])].sort((a, b) => LEVEL_ORDER.indexOf(a.health.level) - LEVEL_ORDER.indexOf(b.health.level));
  const needLook = sorted.filter((f) => f.health.level === "stalled" || f.health.level === "attention").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Cross-Farm Overview</h1>
        <p className="mt-1 text-sm text-ink-3">Every farm on the platform: whether it is working, who owns it, and its organization&apos;s plan.</p>
      </div>

      <AdminSectionCard title="Farms" icon={LayoutGrid}
        description={`${sorted.length} farm${sorted.length === 1 ? "" : "s"} across the platform, ${needLook} needing a look. Open a farm for the detail.`}>
        {error ? (
          <div className="py-6 text-center text-sm text-red">{error}</div>
        ) : sorted.length === 0 ? (
          <div className="py-6 text-center text-sm text-ink-4">No farms found.</div>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="min-w-full divide-y divide-line">
              <thead>
                <tr>
                  {["Farm", "Health", "Main issue", "Last activity", "Alerts", "Pending", "Blocks", "Members", "Owner", "Plan"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-tile">
                {sorted.map((f) => (
                  <tr key={f.id} className="hover:bg-tile/50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium">
                      <Link href={`/admin/overview/${f.id}`} className="text-green underline-offset-2 hover:underline">{f.name}</Link>
                      <p className="text-xs font-normal text-ink-4">{f.organizationName || "No organization"}</p>
                    </td>
                    <td className="px-4 py-3"><HealthBadge level={f.health.level} /></td>
                    <td className="min-w-[16rem] px-4 py-3 text-sm text-ink-2">
                      {f.health.issues[0]?.message ?? "—"}
                      {f.health.issues.length > 1 && <span className="text-ink-4"> +{f.health.issues.length - 1} more</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-3">{describeAge(f.lastActivity, now)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-3">{f.openAlerts}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-3">{f.pendingRecommendations}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-3">{f.blockCount}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-3">{f.memberCount}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-3">{f.ownerName || f.ownerEmail || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <SubscriptionStatusBadge status={f.subscriptionStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSectionCard>
    </div>
  );
}
