import Link from "next/link";
import { notFound } from "next/navigation";
import { Users, Map, Receipt, ArrowLeft } from "lucide-react";
import { getSubscriberDetail } from "@/app/(superadmin)/admin/actions";
import AdminSectionCard, { SubscriptionStatusBadge } from "@/app/components/admin/AdminSectionCard";

function formatCurrency(amountInSmallestUnit: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(amountInSmallestUnit / 100);
}

export default async function SubscriberDetailPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { subscriber, error } = await getSubscriberDetail(orgId);

  if (error || !subscriber) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/subscribers" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Back to subscribers
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-ink">{subscriber.name}</h1>
          <SubscriptionStatusBadge status={subscriber.subscriptionStatus} />
        </div>
        <p className="mt-1 text-sm text-ink-3">
          {subscriber.billingEmail} · {subscriber.farms.length} / {subscriber.farmSeats} farm seats used
        </p>
        {subscriber.stripeCustomerId && (
          <p className="mt-1 font-mono text-xs text-ink-4">
            Stripe customer: {subscriber.stripeCustomerId}
            {subscriber.stripeSubscriptionId ? ` · Subscription: ${subscriber.stripeSubscriptionId}` : ""}
          </p>
        )}
      </div>

      <AdminSectionCard title="Members" icon={Users} description={`${subscriber.members.length} member${subscriber.members.length === 1 ? "" : "s"}`}>
        {subscriber.members.length === 0 ? (
          <div className="py-6 text-center text-sm text-ink-4">No members.</div>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="min-w-full divide-y divide-line">
              <thead>
                <tr>
                  {["Name", "Email", "Role"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-tile">
                {subscriber.members.map((m) => (
                  <tr key={m.id} className="hover:bg-tile/50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-ink">{m.name || "Anonymous"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-3">{m.email || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="rounded-md bg-tile px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-ink-3">{m.role}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSectionCard>

      <AdminSectionCard title="Farms" icon={Map} description={`${subscriber.farms.length} farm${subscriber.farms.length === 1 ? "" : "s"}`}>
        {subscriber.farms.length === 0 ? (
          <div className="py-6 text-center text-sm text-ink-4">No farms yet.</div>
        ) : (
          <ul className="divide-y divide-tile">
            {subscriber.farms.map((f) => (
              <li key={f.id} className="flex items-center justify-between py-3">
                <span className="text-sm font-medium text-ink">{f.name}</span>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-ink-4">Created {new Date(f.createdAt).toLocaleDateString()}</span>
                  <Link href={`/${f.id}/dashboard`} className="text-sm font-medium text-green hover:underline">
                    Open dashboard
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminSectionCard>

      <AdminSectionCard title="Payment History" icon={Receipt} description={`${subscriber.invoices.length} invoice${subscriber.invoices.length === 1 ? "" : "s"} synced from Stripe`}>
        {subscriber.invoices.length === 0 ? (
          <div className="py-6 text-center text-sm text-ink-4">No invoices yet.</div>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="min-w-full divide-y divide-line">
              <thead>
                <tr>
                  {["Date", "Amount", "Status", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-tile">
                {subscriber.invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-tile/50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-3">{new Date(inv.createdAt).toLocaleDateString()}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-ink">{formatCurrency(inv.amountPaid, inv.currency)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-3">{inv.status}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      {inv.hostedInvoiceUrl && (
                        <a href={inv.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-green hover:underline">
                          View invoice
                        </a>
                      )}
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
