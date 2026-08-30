-- Run this in the Supabase SQL editor.
-- Caches Stripe invoice events so the super-admin payment-history view reads
-- from Supabase instead of calling the live Stripe API on every page load.
-- Populated exclusively by the webhook handler at app/api/webhooks/stripe/route.ts.

CREATE TABLE IF NOT EXISTS public.stripe_invoices (
  id                  TEXT        PRIMARY KEY, -- Stripe invoice id (e.g. "in_...")
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  amount_paid         INTEGER     NOT NULL, -- smallest currency unit (e.g. cents)
  currency            TEXT        NOT NULL,
  status              TEXT        NOT NULL,
  hosted_invoice_url  TEXT,
  created_at          TIMESTAMPTZ NOT NULL, -- Stripe's invoice creation time
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_invoices_organization_id ON public.stripe_invoices(organization_id);

ALTER TABLE public.stripe_invoices ENABLE ROW LEVEL SECURITY;

-- Intentionally no client SELECT/INSERT/UPDATE/DELETE policy at all — this
-- is financial data. Reads only happen via createAdminClient() behind the
-- requireSuperAdmin() guard (or, later, an org-owner-scoped billing action);
-- writes only happen from the Stripe webhook handler's service-role client.
