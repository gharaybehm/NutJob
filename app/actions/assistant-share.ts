/* eslint-disable @typescript-eslint/no-explicit-any -- the assistant tables are not in the generated Supabase types yet */
'use server';

// "Share with support": the one way the platform operator can read a
// conversation (Requirements.md, Field assistant: Privacy). Only the person who
// asked can share or withdraw, for one conversation at a time, for a limited
// time. The operator's side is in app/(superadmin)/admin/actions.ts.

import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import { requireFarmRole } from '@/utils/supabase/farm-access';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type ShareStatus = { expiresAt: string } | null;
const SHARE_DAYS = 14;

/** The caller's own thread on this farm, or an error. */
async function ownThread(farmId: string, threadId: string) {
  if (!UUID.test(threadId)) return { error: 'Not found.' as const };
  const gate = await requireFarmRole(farmId, 'supervisor');
  if (!gate.ok) return { error: gate.error };
  const admin = createAdminClient() as any;
  const { data: thread } = await admin
    .from('assistant_threads')
    .select('id, user_id')
    .eq('id', threadId)
    .eq('farm_id', farmId)
    .maybeSingle();
  if (!thread) return { error: 'Not found.' as const };
  if (thread.user_id !== gate.actor.userId) return { error: 'Only the person who asked can share this conversation.' as const };
  return { admin, userId: gate.actor.userId as string };
}

export async function shareWithSupport(farmId: string, threadId: string): Promise<{ share?: ShareStatus; error?: string }> {
  const own = await ownThread(farmId, threadId);
  if ('error' in own) return { error: own.error };
  const { admin, userId } = own;
  const now = new Date();

  // Sharing again replaces the earlier share (one open share per conversation).
  await admin.from('assistant_shares').update({ revoked_at: now.toISOString() }).eq('thread_id', threadId).is('revoked_at', null);
  const expiresAt = new Date(now.getTime() + SHARE_DAYS * 86_400_000).toISOString();
  const { error } = await admin
    .from('assistant_shares')
    .insert({ thread_id: threadId, farm_id: farmId, shared_by: userId, expires_at: expiresAt });
  if (error) {
    console.error('[assistant] share insert failed:', error.code ?? 'unknown');
    return { error: 'The conversation could not be shared.' };
  }
  await admin.from('assistant_events').insert({ farm_id: farmId, user_id: userId, kind: 'share_created' });
  return { share: { expiresAt } };
}

/**
 * Withdrawing needs only ownership, not the current role: someone moved to
 * worker can still take back what they shared.
 */
export async function withdrawShare(farmId: string, threadId: string): Promise<{ ok?: true; error?: string }> {
  if (!UUID.test(threadId)) return { error: 'Not found.' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };
  const admin = createAdminClient() as any;
  const { data: thread } = await admin
    .from('assistant_threads')
    .select('id')
    .eq('id', threadId)
    .eq('farm_id', farmId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!thread) return { error: 'Not found.' };
  const userId = user.id;
  const { data, error } = await admin
    .from('assistant_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .eq('farm_id', farmId)
    .is('revoked_at', null)
    .select('id');
  if (error) return { error: 'The share could not be withdrawn.' };
  if ((data ?? []).length > 0) await admin.from('assistant_events').insert({ farm_id: farmId, user_id: userId, kind: 'share_withdrawn' });
  return { ok: true };
}

/** The live share on one of the caller's own conversations (owner checked above). */
export async function getShareStatus(farmId: string, threadId: string): Promise<ShareStatus> {
  const own = await ownThread(farmId, threadId);
  if ('error' in own) return null;
  const { data } = await own.admin
    .from('assistant_shares')
    .select('expires_at')
    .eq('thread_id', threadId)
    .eq('farm_id', farmId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  return data ? { expiresAt: data.expires_at } : null;
}
