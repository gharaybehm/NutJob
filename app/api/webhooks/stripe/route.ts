/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Supabase client casts, same convention as other server actions */
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/utils/stripe";
import { createAdminClient } from "@/utils/supabase/admin";

// Stripe webhook — syncs organizations.subscription_status/farm_seats and
// caches paid invoices for the super-admin payment-history view.
//
// This route is intentionally NOT gated by the app's normal Supabase session
// auth (utils/supabase/middleware.ts) — Stripe calls it directly and
// authenticates solely via the `stripe-signature` header, the same
// exemption pattern /api/cron/* uses with CRON_SECRET instead of a session.
//
// Local testing: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { error: `Signature verification failed: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 400 }
    );
  }

  // Signature is verified past this point — always return 200 even if a
  // downstream DB write fails, so Stripe doesn't retry-storm on a bug here.
  try {
    const admin = createAdminClient();

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const organizationId = session.metadata?.organization_id;
        if (organizationId && session.customer && session.subscription) {
          await (admin as any).from("organizations").update({
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            subscription_status: "active",
            updated_at: new Date().toISOString(),
          }).eq("id", organizationId);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const organizationId = subscription.metadata?.organization_id;
        const seats = subscription.items.data[0]?.quantity;
        if (organizationId) {
          await (admin as any).from("organizations").update({
            subscription_status: subscription.status,
            ...(seats != null ? { farm_seats: seats } : {}),
            updated_at: new Date().toISOString(),
          }).eq("id", organizationId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const organizationId = subscription.metadata?.organization_id;
        if (organizationId) {
          // Status flip only — never delete the org or its farms.
          await (admin as any).from("organizations").update({
            subscription_status: "canceled",
            updated_at: new Date().toISOString(),
          }).eq("id", organizationId);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const organizationId = await resolveOrganizationId(admin, invoice);
        if (organizationId) {
          await (admin as any).from("organizations").update({
            subscription_status: "past_due",
            updated_at: new Date().toISOString(),
          }).eq("id", organizationId);
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const organizationId = await resolveOrganizationId(admin, invoice);
        if (organizationId) {
          await (admin as any).from("stripe_invoices").upsert({
            id: invoice.id,
            organization_id: organizationId,
            amount_paid: invoice.amount_paid,
            currency: invoice.currency,
            status: invoice.status,
            hosted_invoice_url: invoice.hosted_invoice_url,
            created_at: new Date(invoice.created * 1000).toISOString(),
            synced_at: new Date().toISOString(),
          });
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
  }

  return NextResponse.json({ received: true });
}

// Invoices carry the subscription's metadata, not their own — resolve the
// organization via the invoice's subscription, falling back to a lookup by
// Stripe customer id for edge cases (e.g. one-off invoices).
async function resolveOrganizationId(
  admin: ReturnType<typeof createAdminClient>,
  invoice: Stripe.Invoice
): Promise<string | null> {
  const subscriptionRef = invoice.parent?.subscription_details?.subscription;
  const subscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;

  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (subscription.metadata?.organization_id) return subscription.metadata.organization_id;
  }

  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return null;

  const { data: org } = await (admin as any)
    .from("organizations")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return org?.id ?? null;
}
