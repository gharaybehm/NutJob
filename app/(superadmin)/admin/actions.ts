/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Supabase client casts, same convention as app/(dashboard)/settings/actions.ts */
'use server';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

async function requireSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, error: 'Not authenticated' as const };
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'super_admin') return { user: null, error: 'Super admin access required' as const };
  return { user, error: null };
}

export interface FarmOverviewRow {
  id: string;
  name: string;
  ownerName: string | null;
  ownerEmail: string | null;
  organizationName: string | null;
  subscriptionStatus: string | null;
  memberCount: number;
  blockCount: number;
  createdAt: string;
}

export async function getCrossFarmOverview(): Promise<{ farms?: FarmOverviewRow[]; error?: string }> {
  const { error: authError } = await requireSuperAdmin();
  if (authError) return { error: authError };

  const admin = createAdminClient();

  const { data: farms, error } = await (admin as any)
    .from('farms')
    .select('id, name, created_by, created_at, organization_id, organizations(name, subscription_status), farm_members(user_id, role)')
    .order('created_at', { ascending: false });
  if (error) return { error: error.message };

  const farmIds = (farms ?? []).map((f: any) => f.id);
  const { data: blockRows } = farmIds.length
    ? await (admin as any).from('blocks').select('farm_id').in('farm_id', farmIds)
    : { data: [] };
  const blockCountByFarm: Record<string, number> = {};
  (blockRows ?? []).forEach((b: { farm_id: string }) => {
    blockCountByFarm[b.farm_id] = (blockCountByFarm[b.farm_id] ?? 0) + 1;
  });

  const ownerIds = (farms ?? []).map((f: any) => f.created_by).filter(Boolean);
  const { data: owners } = ownerIds.length
    ? await (admin as any).from('user_profiles').select('id, full_name').in('id', ownerIds)
    : { data: [] };
  const ownerNameById: Record<string, string | null> = {};
  (owners ?? []).forEach((o: { id: string; full_name: string | null }) => {
    ownerNameById[o.id] = o.full_name;
  });

  const ownerEmailById: Record<string, string | null> = {};
  if (ownerIds.length) {
    const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
    (authUsers?.users ?? []).forEach((u) => {
      if (ownerIds.includes(u.id)) ownerEmailById[u.id] = u.email ?? null;
    });
  }

  const rows: FarmOverviewRow[] = (farms ?? []).map((f: any) => ({
    id: f.id,
    name: f.name,
    ownerName: ownerNameById[f.created_by] ?? null,
    ownerEmail: ownerEmailById[f.created_by] ?? null,
    organizationName: f.organizations?.name ?? null,
    subscriptionStatus: f.organizations?.subscription_status ?? null,
    memberCount: f.farm_members?.length ?? 0,
    blockCount: blockCountByFarm[f.id] ?? 0,
    createdAt: f.created_at,
  }));

  return { farms: rows };
}

export interface SubscriberRow {
  id: string;
  name: string;
  billingEmail: string;
  subscriptionStatus: string;
  farmSeats: number;
  farmCount: number;
  memberCount: number;
  createdAt: string;
}

export async function getSubscribers(): Promise<{ subscribers?: SubscriberRow[]; error?: string }> {
  const { error: authError } = await requireSuperAdmin();
  if (authError) return { error: authError };

  const admin = createAdminClient();
  const { data: orgs, error } = await (admin as any)
    .from('organizations')
    .select('id, name, billing_email, subscription_status, farm_seats, created_at, farms(id), organization_members(id)')
    .order('created_at', { ascending: false });
  if (error) return { error: error.message };

  const subscribers: SubscriberRow[] = (orgs ?? []).map((o: any) => ({
    id: o.id,
    name: o.name,
    billingEmail: o.billing_email,
    subscriptionStatus: o.subscription_status,
    farmSeats: o.farm_seats,
    farmCount: o.farms?.length ?? 0,
    memberCount: o.organization_members?.length ?? 0,
    createdAt: o.created_at,
  }));

  return { subscribers };
}

export interface SubscriberDetail {
  id: string;
  name: string;
  billingEmail: string;
  subscriptionStatus: string;
  farmSeats: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdAt: string;
  members: { id: string; name: string | null; email: string | null; role: string }[];
  farms: { id: string; name: string; createdAt: string }[];
  invoices: { id: string; amountPaid: number; currency: string; status: string; hostedInvoiceUrl: string | null; createdAt: string }[];
}

export async function getSubscriberDetail(orgId: string): Promise<{ subscriber?: SubscriberDetail; error?: string }> {
  const { error: authError } = await requireSuperAdmin();
  if (authError) return { error: authError };

  const admin = createAdminClient();

  const { data: org, error: orgError } = await (admin as any)
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();
  if (orgError || !org) return { error: orgError?.message ?? 'Subscriber not found' };

  const { data: members } = await (admin as any)
    .from('organization_members')
    .select('id, user_id, role')
    .eq('organization_id', orgId);

  const memberUserIds = (members ?? []).map((m: any) => m.user_id);
  const { data: profiles } = memberUserIds.length
    ? await (admin as any).from('user_profiles').select('id, full_name').in('id', memberUserIds)
    : { data: [] };
  const nameByUserId: Record<string, string | null> = {};
  (profiles ?? []).forEach((p: { id: string; full_name: string | null }) => { nameByUserId[p.id] = p.full_name; });

  const emailByUserId: Record<string, string | null> = {};
  if (memberUserIds.length) {
    const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
    (authUsers?.users ?? []).forEach((u) => {
      if (memberUserIds.includes(u.id)) emailByUserId[u.id] = u.email ?? null;
    });
  }

  const { data: farms } = await (admin as any)
    .from('farms')
    .select('id, name, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  const { data: invoices } = await (admin as any)
    .from('stripe_invoices')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  return {
    subscriber: {
      id: org.id,
      name: org.name,
      billingEmail: org.billing_email,
      subscriptionStatus: org.subscription_status,
      farmSeats: org.farm_seats,
      stripeCustomerId: org.stripe_customer_id,
      stripeSubscriptionId: org.stripe_subscription_id,
      createdAt: org.created_at,
      members: (members ?? []).map((m: any) => ({
        id: m.id,
        name: nameByUserId[m.user_id] ?? null,
        email: emailByUserId[m.user_id] ?? null,
        role: m.role,
      })),
      farms: (farms ?? []).map((f: any) => ({ id: f.id, name: f.name, createdAt: f.created_at })),
      invoices: (invoices ?? []).map((i: any) => ({
        id: i.id,
        amountPaid: i.amount_paid,
        currency: i.currency,
        status: i.status,
        hostedInvoiceUrl: i.hosted_invoice_url,
        createdAt: i.created_at,
      })),
    },
  };
}
