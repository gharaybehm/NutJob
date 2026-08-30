import { LayoutGrid } from "lucide-react";
import { getCrossFarmOverview } from "@/app/(superadmin)/admin/actions";
import AdminSectionCard, { SubscriptionStatusBadge } from "@/app/components/admin/AdminSectionCard";

export default async function AdminOverviewPage() {
  const { farms, error } = await getCrossFarmOverview();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Cross-Farm Overview</h1>
        <p className="mt-1 text-sm text-ink-3">Every farm on the platform, its owner, and its organization&apos;s plan.</p>
      </div>

      <AdminSectionCard title="Farms" icon={LayoutGrid} description={`${farms?.length ?? 0} farm${farms?.length === 1 ? "" : "s"} across the platform`}>
        {error ? (
          <div className="py-6 text-center text-sm text-red">{error}</div>
        ) : !farms || farms.length === 0 ? (
          <div className="py-6 text-center text-sm text-ink-4">No farms found.</div>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="min-w-full divide-y divide-line">
              <thead>
                <tr>
                  {["Farm", "Owner", "Organization", "Plan", "Members", "Blocks", "Created"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-tile">
                {farms.map((f) => (
                  <tr key={f.id} className="hover:bg-tile/50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-ink">{f.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-3">
                      {f.ownerName || f.ownerEmail || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-3">{f.organizationName || "No organization"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <SubscriptionStatusBadge status={f.subscriptionStatus} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-3">{f.memberCount}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-3">{f.blockCount}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-3">
                      {new Date(f.createdAt).toLocaleDateString()}
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
