/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Supabase client casts, same convention as app/actions/farms.ts */
'use server';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { stripe } from '@/utils/stripe';
import type { Organization } from '@/utils/supabase/org-types';

function toSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'org'
  );
}

/**
 * Returns the caller's organization, creating a default one (with the
 * caller as owner) if they don't have one yet. Every farm needs an owning
 * organization for seat-based billing, but most users never explicitly
 * "create an organization" — Requirements.md frames orgs as existing to
 * support B2B, so solo users get a silent 1-person org on first farm
 * creation rather than a separate onboarding step.
 */
export async function getOrCreateOrganizationForUser(): Promise<{ organization?: Organization; error?: string }> {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Not authenticated' };

  const { data: membership } = await (supabase as any)
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membership?.organization_id) {
    const { data: org, error } = await (supabase as any)
      .from('organizations')
      .select('*')
      .eq('id', membership.organization_id)
      .single();
    if (error) return { error: error.message };
    return { organization: org as Organization };
  }

  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'My';
  const name = `${fullName}'s Organization`;
  const slug = toSlug(name);

  const insertOrg = async (s: string) =>
    (admin as any).from('organizations').insert({
      name,
      slug: s,
      billing_email: user.email,
      created_by: user.id,
    }).select('*').single();

  let { data: org, error: orgError } = await insertOrg(slug);
  if (orgError) {
    if (orgError.code === '23505') {
      const retry = await insertOrg(`${slug}-${Date.now().toString(36)}`);
      org = retry.data;
      orgError = retry.error;
    }
    if (orgError) return { error: orgError.message };
  }

  const { error: memberError } = await (admin as any).from('organization_members').insert({
    organization_id: org!.id,
    user_id: user.id,
    role: 'owner',
  });
  if (memberError) return { error: memberError.message };

  return { organization: org as Organization };
}

export async function getOrganizationForUser(): Promise<Organization | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await (supabase as any)
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!membership?.organization_id) return null;

  const { data: org } = await (supabase as any)
    .from('organizations')
    .select('*')
    .eq('id', membership.organization_id)
    .single();
  return (org as Organization) ?? null;
}

/**
 * Creates a Stripe Checkout session (subscription mode, one line item per
 * farm seat) for the caller's organization and returns the redirect URL.
 * Caller must be the org's `owner` — billing access is intentionally
 * narrower than `admin`/`member`.
 */
export async function createCheckoutSession(organizationId: string): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Not authenticated' };

  const { data: membership } = await (supabase as any)
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .single();
  if (membership?.role !== 'owner') return { error: 'Only the organization owner can manage billing' };

  const { data: org, error: orgError } = await (admin as any)
    .from('organizations')
    .select('*')
    .eq('id', organizationId)
    .single();
  if (orgError || !org) return { error: orgError?.message ?? 'Organization not found' };

  const priceId = process.env.STRIPE_PRICE_ID_FARM_SEAT;
  if (!priceId) return { error: 'Billing is not configured (missing STRIPE_PRICE_ID_FARM_SEAT)' };

  let customerId = org.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: org.billing_email,
      name: org.name,
      metadata: { organization_id: org.id },
    });
    customerId = customer.id;
    await (admin as any).from('organizations').update({ stripe_customer_id: customerId }).eq('id', org.id);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: org.farm_seats }],
    // Points at /farms (not /admin) — this checkout is initiated by the org
    // owner themselves; the org-owner-facing Settings → Billing page that
    // will host this flow is a deferred follow-up (see plan), so /farms is
    // the nearest existing page every authenticated user can reach.
    success_url: `${appUrl}/farms?checkout=success`,
    cancel_url: `${appUrl}/farms?checkout=cancelled`,
    metadata: { organization_id: org.id },
    subscription_data: { metadata: { organization_id: org.id } },
  });

  if (!session.url) return { error: 'Stripe did not return a checkout URL' };
  return { url: session.url };
}
