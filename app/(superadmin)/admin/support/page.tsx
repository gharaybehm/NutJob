import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { getSupportShares } from "@/app/(superadmin)/admin/actions";
import AdminSectionCard from "@/app/components/admin/AdminSectionCard";

export default async function AdminSupportPage() {
  const { shares, error } = await getSupportShares();
  const list = shares ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Shared Conversations</h1>
        <p className="mt-1 text-sm text-ink-3">
          Field assistant conversations a farm user chose to share with support. Each can be read only while the share is live, and every view is logged and counted for the farm.
        </p>
      </div>

      <AdminSectionCard title="Live shares" icon={LifeBuoy}
        description={`${list.length} conversation${list.length === 1 ? "" : "s"} shared. Withdrawn and expired shares are not listed and cannot be opened.`}>
        {error ? (
          <div className="py-6 text-center text-sm text-red">{error}</div>
        ) : list.length === 0 ? (
          <div className="py-6 text-center text-sm text-ink-4">Nothing is shared with support.</div>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="min-w-full divide-y divide-line">
              <thead>
                <tr>
                  {["Farm", "Shared", "Expires", "Views", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-tile">
                {list.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 text-sm font-medium text-ink">{s.farmName}</td>
                    <td className="px-4 py-3 text-sm text-ink-3">{new Date(s.sharedAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-ink-3">{new Date(s.expiresAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-sm text-ink-3">{s.views}</td>
                    <td className="px-4 py-3 text-sm">
                      {/* No prefetch: loading the page logs a view, which must only happen when opened. */}
                      <Link href={`/admin/support/${s.id}`} prefetch={false} className="text-green underline-offset-2 hover:underline">Open (logged)</Link>
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
