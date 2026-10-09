/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Supabase client casts, same convention as app/(dashboard)/settings/actions.ts */
'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/utils/supabase/admin';
import { fetchKnowledgeDocuments } from '@/utils/kb-coverage';
import { isGapRequest, knowledgeGaps, type GapRequest, type KnowledgeGap, type KnowledgeRequest, type KnowledgeRequestStatus } from '@/utils/kb-requests';
import type { FarmHealth } from '@/utils/farm-health';
import { loadFarmHealth, type FarmHealthReport } from './farm-health';
import { COUNT_WINDOW_DAYS, countByFarm, countEvents, crossFarmTotals, type AssistantCounts } from '@/utils/assistant/operator-counts';

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
  health: FarmHealth;
  /** The last time someone logged work or acted on a recommendation. */
  lastActivity: string | null;
  openAlerts: number;
  pendingRecommendations: number;
  /** Field assistant questions in the last COUNT_WINDOW_DAYS days (a count, never text). */
  assistantQuestions: number;
}

export interface AssistantOverview {
  /** Totals across farms; null while fewer than MIN_FARMS_FOR_TOTALS farms contribute. */
  totals: AssistantCounts | null;
  contributingFarms: number;
}

/** assistant_events rows since the count window began, all farms. Kind, category and farm only. */
async function assistantEventsSince(admin: any, farmId?: string) {
  const since = new Date(Date.now() - COUNT_WINDOW_DAYS * 86_400_000).toISOString();
  let q = admin.from('assistant_events').select('farm_id, kind, category').gte('created_at', since).limit(50_000);
  if (farmId) q = q.eq('farm_id', farmId);
  const { data, error } = await q;
  return error ? null : ((data ?? []) as { farm_id: string; kind: string; category: string | null }[]);
}

export async function getCrossFarmOverview(): Promise<{ farms?: FarmOverviewRow[]; assistant?: AssistantOverview; error?: string }> {
  const { error: authError } = await requireSuperAdmin();
  if (authError) return { error: authError };

  const admin = createAdminClient();

  const { data: farms, error } = await (admin as any)
    .from('farms')
    .select('id, name, gps_lat, gps_lng, created_by, created_at, organization_id, organizations(name, subscription_status), farm_members(user_id, role)')
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

  // One set of small queries per farm: fine for the number of farms on the platform today.
  const now = new Date();
  const docs = await fetchKnowledgeDocuments(admin);
  const reports = await Promise.all((farms ?? []).map((f: any) => loadFarmHealth(admin, f, docs, now)));
  const events = await assistantEventsSince(admin);
  const perFarm = countByFarm(events ?? []);

  const rows: FarmOverviewRow[] = (farms ?? []).map((f: any, i: number) => ({
    health: reports[i].health,
    lastActivity: reports[i].signals.lastActivity,
    openAlerts: reports[i].signals.openAlerts.critical + reports[i].signals.openAlerts.warning + reports[i].signals.openAlerts.info,
    pendingRecommendations: reports[i].signals.pendingRecommendations,
    id: f.id,
    name: f.name,
    ownerName: ownerNameById[f.created_by] ?? null,
    ownerEmail: ownerEmailById[f.created_by] ?? null,
    organizationName: f.organizations?.name ?? null,
    subscriptionStatus: f.organizations?.subscription_status ?? null,
    memberCount: f.farm_members?.length ?? 0,
    blockCount: blockCountByFarm[f.id] ?? 0,
    createdAt: f.created_at,
    assistantQuestions: perFarm.get(f.id)?.questions ?? 0,
  }));

  return { farms: rows, assistant: events ? crossFarmTotals(perFarm) : undefined };
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

export interface KnowledgeQueue {
  gaps: KnowledgeGap[];
  /** Questions from the field assistant that the loaded guides did not cover; closed by hand. */
  questions: GapRequest[];
  /** Display name of each requester, keyed by user id. */
  requesterNames: Record<string, string>;
}

/**
 * Every crop and variety on any farm that has no guides, with the requests
 * farms made for them. Gaps are listed whether or not anyone asked.
 */
export async function getKnowledgeQueue(): Promise<{ queue?: KnowledgeQueue; error?: string }> {
  const { error: authError } = await requireSuperAdmin();
  if (authError) return { error: authError };

  const admin = createAdminClient();

  const docs = await fetchKnowledgeDocuments(admin);
  if (docs === null) return { error: 'The knowledge base documents could not be read (is migration 20261005000000 applied?).' };

  const { data: requests, error: requestsError } = await (admin as any).from('knowledge_requests').select('*').order('created_at');
  if (requestsError) return { error: `The requests could not be read (is migration 20261005000100 applied?): ${requestsError.message}` };

  const { data: blocks, error: blocksError } = await (admin as any).from('blocks').select('farm_id, crop_type, variety');
  if (blocksError) return { error: blocksError.message };

  const { data: farms } = await (admin as any).from('farms').select('id, name');
  const farmNames = new Map<string, string>(((farms ?? []) as { id: string; name: string }[]).map((f) => [f.id, f.name]));

  const requesterIds = [...new Set(((requests ?? []) as KnowledgeRequest[]).map((r) => r.requested_by).filter(Boolean))] as string[];
  const { data: profiles } = requesterIds.length
    ? await (admin as any).from('user_profiles').select('id, full_name').in('id', requesterIds)
    : { data: [] };
  const requesterNames: Record<string, string> = {};
  ((profiles ?? []) as { id: string; full_name: string | null }[]).forEach((p) => {
    requesterNames[p.id] = p.full_name?.trim() || 'Unknown user';
  });

  const all = (requests ?? []) as KnowledgeRequest[];
  // The farm chose to send these to the platform team (the drawer says so before sending).
  const questions = all
    .filter((r) => !isGapRequest(r))
    .map((r) => ({ ...r, farmName: farmNames.get(r.farm_id) ?? 'Unknown farm' }))
    .sort((a, b) => Number(a.status === 'done' || a.status === 'declined') - Number(b.status === 'done' || b.status === 'declined'));
  return { queue: { gaps: knowledgeGaps(blocks ?? [], farmNames, docs, all), questions, requesterNames } };
}

const REQUEST_STATUSES: KnowledgeRequestStatus[] = ['open', 'in_progress', 'done', 'declined'];

/** The platform admin's answer to a request: where it stands, and a reply the farm can read. */
export async function updateKnowledgeRequest(
  id: string,
  input: { status: KnowledgeRequestStatus; adminNote: string },
): Promise<{ error?: string }> {
  const { error: authError } = await requireSuperAdmin();
  if (authError) return { error: authError };
  if (!REQUEST_STATUSES.includes(input.status)) return { error: 'Unknown status.' };

  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from('knowledge_requests')
    .update({ status: input.status, admin_note: input.adminNote.trim().slice(0, 1000) || null })
    .eq('id', id)
    .select('farm_id')
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'Request not found.' };

  revalidatePath('/admin/knowledge');
  revalidatePath(`/${data.farm_id}/settings`);
  revalidatePath(`/${data.farm_id}/blocks`);
  return {};
}

export interface FarmHealthDetail {
  farm: { id: string; name: string; createdAt: string; organizationName: string | null; subscriptionStatus: string | null };
  report: FarmHealthReport;
  members: { id: string; name: string | null; email: string | null; role: string; lastSignInAt: string | null }[];
  /** When the figures were read (ISO), so ages on the page are measured from one moment. */
  checkedAt: string;
  /** Field assistant counts for the last COUNT_WINDOW_DAYS days; null when they cannot be read. */
  assistant: AssistantCounts | null;
}

/**
 * One farm's health for the platform admin: setup, job freshness, sensors,
 * alerts, recommendation outcomes, knowledge gaps and who has signed in.
 * Read-only, and limited to counts, times and configuration.
 */
export async function getFarmHealthDetail(farmId: string): Promise<{ detail?: FarmHealthDetail; error?: string }> {
  const { error: authError } = await requireSuperAdmin();
  if (authError) return { error: authError };

  const admin = createAdminClient();

  const { data: farm, error } = await (admin as any)
    .from('farms')
    .select('id, name, gps_lat, gps_lng, created_at, organizations(name, subscription_status), farm_members(user_id, role)')
    .eq('id', farmId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!farm) return { error: 'Farm not found' };

  const now = new Date();
  const report = await loadFarmHealth(admin, farm, await fetchKnowledgeDocuments(admin), now);
  const assistantEvents = await assistantEventsSince(admin, farm.id);

  const memberRows = (farm.farm_members ?? []) as { user_id: string; role: string }[];
  const memberIds = memberRows.map((m) => m.user_id);
  const { data: profiles } = memberIds.length
    ? await (admin as any).from('user_profiles').select('id, full_name').in('id', memberIds)
    : { data: [] };
  const nameById: Record<string, string | null> = {};
  ((profiles ?? []) as { id: string; full_name: string | null }[]).forEach((p) => { nameById[p.id] = p.full_name; });

  const authById: Record<string, { email: string | null; lastSignInAt: string | null }> = {};
  if (memberIds.length) {
    const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
    (authUsers?.users ?? []).forEach((u) => {
      if (memberIds.includes(u.id)) authById[u.id] = { email: u.email ?? null, lastSignInAt: u.last_sign_in_at ?? null };
    });
  }

  return {
    detail: {
      farm: {
        id: farm.id,
        name: farm.name,
        createdAt: farm.created_at,
        organizationName: farm.organizations?.name ?? null,
        subscriptionStatus: farm.organizations?.subscription_status ?? null,
      },
      report,
      members: memberRows.map((m) => ({
        id: m.user_id,
        name: nameById[m.user_id] ?? null,
        email: authById[m.user_id]?.email ?? null,
        role: m.role,
        lastSignInAt: authById[m.user_id]?.lastSignInAt ?? null,
      })),
      checkedAt: now.toISOString(),
      assistant: assistantEvents ? countEvents(assistantEvents) : null,
    },
  };
}

// ─── Field assistant: conversations shared with support ──────────────────────
// The only conversation text the operator can read, and only while the owner's
// share is live (not withdrawn, not expired). Every open is logged first.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SupportShareRow {
  id: string;
  farmName: string;
  sharedAt: string;
  expiresAt: string;
  views: number;
}

/** Live shares: farm name and times only (no title or text until one is opened). */
export async function getSupportShares(): Promise<{ shares?: SupportShareRow[]; error?: string }> {
  const { error: authError } = await requireSuperAdmin();
  if (authError) return { error: authError };
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('assistant_shares')
    .select('id, farm_id, created_at, expires_at, farms(name), assistant_share_views(id)')
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) return { error: 'Shared conversations could not be read (is migration 20261007000200 applied?).' };
  return {
    shares: ((data ?? []) as any[]).map((s) => ({
      id: s.id,
      farmName: s.farms?.name ?? 'Unknown farm',
      sharedAt: s.created_at,
      expiresAt: s.expires_at,
      views: (s.assistant_share_views ?? []).length,
    })),
  };
}

export interface SharedConversation {
  farmName: string;
  sharedAt: string;
  expiresAt: string;
  messages: { role: 'user' | 'assistant'; content: string; createdAt: string; citations: { n: number; title: string; section: string | null }[] }[];
}

/**
 * One shared conversation, while the share is live. The view is logged before
 * anything is returned; if the log cannot be written, nothing is shown.
 */
export async function getSharedConversation(shareId: string): Promise<{ conversation?: SharedConversation; error?: string }> {
  const { user, error: authError } = await requireSuperAdmin();
  if (authError || !user) return { error: authError ?? 'Not authenticated' };
  if (!UUID.test(shareId)) return { error: 'Not found' };
  const admin = createAdminClient() as any;

  const { data: share } = await admin
    .from('assistant_shares')
    .select('id, thread_id, farm_id, created_at, expires_at, revoked_at, farms(name)')
    .eq('id', shareId)
    .maybeSingle();
  if (!share || share.revoked_at || new Date(share.expires_at) <= new Date()) return { error: 'Not found' };

  const { error: logError } = await admin.from('assistant_share_views').insert({ share_id: share.id, viewer_id: user.id });
  if (logError) return { error: 'The view could not be logged, so the conversation is not shown.' };
  await admin.from('assistant_events').insert({ farm_id: share.farm_id, user_id: user.id, kind: 'share_viewed' });

  const { data: rows } = await admin
    .from('assistant_messages')
    .select('role, content, created_at, citations')
    .eq('thread_id', share.thread_id)
    .eq('farm_id', share.farm_id)
    // The conversation as it was when shared: later messages were not shared.
    .lte('created_at', share.created_at)
    .order('created_at', { ascending: true })
    .limit(200);

  return {
    conversation: {
      farmName: share.farms?.name ?? 'Unknown farm',
      sharedAt: share.created_at,
      expiresAt: share.expires_at,
      messages: ((rows ?? []) as any[]).map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
        citations: (Array.isArray(m.citations) ? m.citations : []).map((c: any) => ({ n: c.n, title: c.title, section: c.section ?? null })),
      })),
    },
  };
}

// ─── Crop Knowledge Packs ────────────────────────────────────────────────────

export interface InstalledPackRow {
  packId: string;
  version: string;
  cropName: string;
  installedAt: string;
  digest: string;
  /** From the validation report stored at install time. */
  toBeSourced: { id: string; unit: string; engines: string[]; note: string | null }[];
  expertEstimates: number;
  pendingContent: { section: string; item: string }[];
  reviewNotes: { where: string; note: string }[];
  testsPassed: number;
  testsTotal: number;
  engines: { engineId: string; hasContent: boolean; liveBlockedBy: string[] }[];
  /** Counts only: how many blocks, on how many farms, are bound to this version. */
  blocksBound: number;
  farmsBound: number;
  /** Engines switched to Live for this pack, across all farms (a count). */
  liveSwitches: number;
}

/**
 * Installed packs with their validation reports and how widely each is used.
 * Packs hold published science and no farm data; usage is given as counts.
 */
export async function getInstalledPacks(): Promise<{ packs: InstalledPackRow[] | null; error: string | null }> {
  const gate = await requireSuperAdmin();
  if (gate.error) return { packs: null, error: gate.error };
  const admin = createAdminClient() as any;

  const { data: rows, error } = await admin.from('crop_packs').select('pack_id, version, crop_name, digest, report, installed_at').order('pack_id').order('installed_at', { ascending: false });
  if (error) return { packs: null, error: error.message };
  const { data: blocks } = await admin.from('blocks').select('farm_id, pack_id, pack_version').not('pack_id', 'is', null);
  const { data: modes } = await admin.from('farm_engine_modes').select('pack_id, mode').eq('mode', 'live');

  const packs: InstalledPackRow[] = (rows ?? []).map((p: any) => {
    const report = p.report ?? {};
    const bound = (blocks ?? []).filter((b: any) => b.pack_id === p.pack_id && b.pack_version === p.version);
    const tests: any[] = Array.isArray(report.tests) ? report.tests : [];
    return {
      packId: p.pack_id,
      version: p.version,
      cropName: p.crop_name,
      installedAt: p.installed_at,
      digest: p.digest,
      toBeSourced: Array.isArray(report.toBeSourced) ? report.toBeSourced : [],
      expertEstimates: Array.isArray(report.expertEstimates) ? report.expertEstimates.length : 0,
      pendingContent: Array.isArray(report.pendingContent) ? report.pendingContent : [],
      reviewNotes: Array.isArray(report.reviewNotes) ? report.reviewNotes : [],
      testsPassed: tests.filter((t) => t.passed).length,
      testsTotal: tests.length,
      engines: Object.entries(report.engines ?? {}).map(([engineId, e]: [string, any]) => ({ engineId, hasContent: e?.hasContent === true, liveBlockedBy: Array.isArray(e?.liveBlockedBy) ? e.liveBlockedBy : [] })),
      blocksBound: bound.length,
      farmsBound: new Set(bound.map((b: any) => b.farm_id)).size,
      liveSwitches: (modes ?? []).filter((m: any) => m.pack_id === p.pack_id).length,
    };
  });
  return { packs, error: null };
}
