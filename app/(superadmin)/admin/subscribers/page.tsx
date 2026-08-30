import Link from "next/link";
import { Building2 } from "lucide-react";
import { getSubscribers } from "@/app/(superadmin)/admin/actions";
import AdminSectionCard, { SubscriptionStatusBadge } from "@/app/components/admin/AdminSectionCard";

export default async function AdminSubscribersPage() {
  const { subscribers, error } = await getSubscribers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Subscribers</h1>
        <p className="mt-1 text-sm text-ink-3">Every organization on the platform and its billing status.</p>
      </div>

      <AdminSectionCard title="Organizations" icon={Building2} description={`${subscribers?.length ?? 0} subscriber${subscribers?.length === 1 ? "" : "s"}`}>
        {error ? (
          <div className="py-6 text-center text-sm text-red">{error}</div>
        ) : !subscribers || subscribers.length === 0 ? (
          <div className="py-6 text-center text-sm text-ink-4">No organizations found.</div>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="min-w-full divide-y divide-line">
              <thead>
                <tr>
                  {["Organization", "Billing Email", "Plan", "Seats Used", "Members", "Created", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-tile">
                {subscribers.map((s) => (
                  <tr key={s.id} className="hover:bg-tile/50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-ink">{s.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-3">{s.billingEmail}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <SubscriptionStatusBadge status={s.subscriptionStatus} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-3">
                      {s.farmCount} / {s.farmSeats}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-3">{s.memberCount}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-3">{new Date(s.createdAt).toLocaleDateString()}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <Link href={`/admin/subscribers/${s.id}`} className="font-medium text-green hover:underline">
                        View
                      </Link>
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
