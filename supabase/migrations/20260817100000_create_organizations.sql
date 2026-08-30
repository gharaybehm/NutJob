-- Run this in the Supabase SQL editor.
-- Introduces the B2B billing entity described in Requirements.md ("B2B
-- multi-farm subscription — planned"). An organisation holds the Stripe
-- customer/subscription and a farm-seat quantity; farms optionally belong
-- to one organisation. Stripe fields stay null until the checkout/webhook
-- integration (a later migration) starts populating them.

-- ─── organizations ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organizations (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT        NOT NULL,
  slug                   TEXT        NOT NULL UNIQUE,
  billing_email          TEXT        NOT NULL,
  stripe_customer_id     TEXT        UNIQUE,
  stripe_subscription_id TEXT        UNIQUE,
  subscription_status    TEXT        NOT NULL DEFAULT 'trialing'
                                      CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled', 'incomplete')),
  -- Defaults to 3 (not the spec's trial-of-1) to match today's existing
  -- hardcoded farm cap in app/actions/farms.ts, so existing multi-farm users
  -- don't regress the moment orgs are introduced. Revisit once real Stripe
  -- seat purchasing (Phase C) makes the trial-of-1 story coherent end-to-end.
  farm_seats             INTEGER     NOT NULL DEFAULT 3,
  created_by             UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ─── organization_members ───────────────────────────────────────────────────
-- Created before the organizations policy below, since that policy's USING
-- clause queries this table.

CREATE TABLE IF NOT EXISTS public.organization_members (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT        NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_members_org_id ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON public.organization_members(user_id);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- ─── organizations RLS policy ───────────────────────────────────────────────
-- Members can read their own organization. No client INSERT/UPDATE/DELETE
-- policy — all mutations go through server actions using the service-role
-- client, same convention as farm_members writes in settings/actions.ts.

DROP POLICY IF EXISTS "members_read_organizations" ON public.organizations;
CREATE POLICY "members_read_organizations"
  ON public.organizations FOR SELECT
  USING (
    id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

-- ─── organization_members RLS policy ────────────────────────────────────────

DROP POLICY IF EXISTS "members_read_organization_members" ON public.organization_members;
CREATE POLICY "members_read_organization_members"
  ON public.organization_members FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

-- ─── farms.organization_id ──────────────────────────────────────────────────
-- Nullable: existing farms are not backfilled/guessed into an organization
-- (per the same "don't guess ownership" decision used in the inventory
-- migration). They show as "No organization" in the super-admin overview
-- until a real org is created for them.

ALTER TABLE public.farms
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_farms_organization_id ON public.farms(organization_id);
