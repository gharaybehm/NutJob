/* eslint-disable @typescript-eslint/no-explicit-any -- the assistant tables are not in the generated Supabase types yet */
'use server';

// Field assistant conversations: list, open, delete, and the suggested
// questions. Supervisors and admins only. Reads go through the caller's own
// Supabase client so row-level security applies on top of the role check: a
// supervisor sees their own conversations, a farm admin every conversation on
// the farm. The answer itself comes from app/api/farms/[farmId]/assistant.

import { createClient } from '@/utils/supabase/server';
import { getFarmMemberNames, requireFarmRole } from '@/utils/supabase/farm-access';
import { notExpiredFilter } from '@/utils/recommendation-lifecycle';
import { buildSuggestions, type Suggestion } from '@/utils/assistant/suggestions';
import { canRequestGuidesFor, type AssistantMessage, type AssistantThreadSummary } from '@/utils/assistant/types';
import { createAdminClient } from '@/utils/supabase/admin';
import { isFarmReadOnly } from '@/utils/farm-status';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listAssistantThreads(
  farmId: string,
): Promise<{ threads?: AssistantThreadSummary[]; isAdmin?: boolean; error?: string }> {
  const gate = await requireFarmRole(farmId, 'supervisor');
  if (!gate.ok) return { error: gate.error };
  const supabase = (await createClient()) as any;

  const { data, error } = await supabase
    .from('assistant_threads')
    .select('id, title, user_id, last_activity_at')
    .eq('farm_id', farmId)
    .order('last_activity_at', { ascending: false })
    .limit(100);
  if (error) return { error: 'Conversations could not be loaded.' };

  const isAdmin = gate.actor.role === 'admin';
  const others = ((data ?? []) as any[]).some((r) => r.user_id !== gate.actor.userId);
  const names = isAdmin && others ? await getFarmMemberNames(farmId) : new Map<string, string>();

  return {
    isAdmin,
    threads: ((data ?? []) as any[]).map((r) => {
      const mine = r.user_id === gate.actor.userId;
      return {
        id: r.id,
        title: r.title,
        lastActivityAt: r.last_activity_at,
        mine,
        ...(mine ? {} : { ownerName: names.get(r.user_id) ?? 'Unknown user' }),
      };
    }),
  };
}

export async function getAssistantThread(
  farmId: string,
  threadId: string,
): Promise<{ messages?: AssistantMessage[]; pins?: Record<string, string>; mine?: boolean; error?: string }> {
  if (!UUID.test(threadId)) return { error: 'Not found.' };
  const gate = await requireFarmRole(farmId, 'supervisor');
  if (!gate.ok) return { error: gate.error };
  const supabase = (await createClient()) as any;

  const { data: thread } = await supabase
    .from('assistant_threads')
    .select('id, user_id, pins')
    .eq('id', threadId)
    .eq('farm_id', farmId)
    .maybeSingle();
  if (!thread) return { error: 'Not found.' };

  const { data: rows, error } = await supabase
    .from('assistant_messages')
    .select('id, role, content, kind, citations, reference_status, record_refs, drafts, draft_states, search_scope, created_at')
    .eq('thread_id', threadId)
    .eq('farm_id', farmId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) return { error: 'Conversation could not be loaded.' };

  // What became of each draft comes from the recommendations it was written to
  // (one row per draft, enforced by a unique index), so two cards acted on at
  // once cannot overwrite each other's state. draft_states keeps the guide request.
  const answerIds = ((rows ?? []) as any[]).filter((m) => m.role === 'assistant' && Array.isArray(m.drafts) && m.drafts.length > 0).map((m) => m.id);
  const handled = new Map<string, Record<string, any>>();
  if (answerIds.length > 0) {
    const { data: recs } = await supabase
      .from('recommendations')
      .select('id, assistant_message_id, draft_index, status, manager_note, acted_at')
      .eq('farm_id', farmId)
      .in('assistant_message_id', answerIds);
    for (const r of (recs ?? []) as any[]) {
      const states = handled.get(r.assistant_message_id) ?? {};
      states[String(r.draft_index)] =
        r.status === 'skipped'
          ? { state: 'dismissed', recommendation_id: r.id, reason: String(r.manager_note ?? '').replace(/^skip_reason:/, '') || null, at: r.acted_at }
          : { state: r.status === 'edited' ? 'edited' : 'accepted', recommendation_id: r.id, at: r.acted_at };
      handled.set(r.assistant_message_id, states);
    }
  }

  return {
    mine: thread.user_id === gate.actor.userId,
    pins: thread.pins ?? {},
    messages: ((rows ?? []) as any[]).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      kind: m.kind,
      citations: m.citations ?? [],
      referenceStatus: m.reference_status ?? null,
      recordRefs: m.record_refs ?? [],
      drafts: Array.isArray(m.drafts) ? m.drafts : [],
      draftStates: { ...(m.draft_states?.guides ? { guides: m.draft_states.guides } : {}), ...(handled.get(m.id) ?? {}) },
      canRequestGuides: canRequestGuidesFor(m.reference_status ?? null, m.search_scope),
      createdAt: m.created_at,
    })),
  };
}

/** Deletes one of the caller's own conversations (an admin cannot delete someone else's). */
export async function deleteAssistantThread(farmId: string, threadId: string): Promise<{ ok?: true; error?: string }> {
  if (!UUID.test(threadId)) return { error: 'Not found.' };
  const gate = await requireFarmRole(farmId, 'supervisor');
  if (!gate.ok) return { error: gate.error };
  const supabase = (await createClient()) as any;

  const { data, error } = await supabase
    .from('assistant_threads')
    .delete()
    .eq('id', threadId)
    .eq('farm_id', farmId)
    .eq('user_id', gate.actor.userId)
    .select('id');
  if (error || !data || data.length === 0) return { error: 'The conversation could not be deleted.' };
  return { ok: true };
}

export interface AssistantStartData {
  suggestions: Suggestion[];
  blocks: { id: string; name: string }[];
  recommendations: { id: string; title: string; blockId: string | null }[];
  /** The farm's subscription has lapsed: drafts cannot be accepted. */
  readOnly: boolean;
}

/** Blocks and open cards for the pin pickers, and suggested questions. */
export async function getAssistantStart(farmId: string, blockId?: string | null): Promise<AssistantStartData | { error: string }> {
  const gate = await requireFarmRole(farmId, 'supervisor');
  if (!gate.ok) return { error: gate.error };
  const supabase = (await createClient()) as any;

  const { data: blocks } = await supabase.from('blocks').select('id, name').eq('farm_id', farmId).order('name');
  const blockList = ((blocks ?? []) as { id: string; name: string }[]);
  const ids = blockList.map((b) => b.id);
  const nameOf = new Map(blockList.map((b) => [b.id, b.name]));

  const [{ data: alerts }, { data: recs }] = await Promise.all([
    ids.length > 0
      ? supabase.from('block_alerts').select('block_id, domain, severity').in('block_id', ids).eq('resolved', false).limit(50)
      : Promise.resolve({ data: [] }),
    supabase
      .from('recommendations')
      .select('id, block_id, title')
      .eq('farm_id', farmId)
      .eq('status', 'pending')
      .or(notExpiredFilter(new Date()))
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const pinned = blockId && nameOf.has(blockId) ? { id: blockId, name: nameOf.get(blockId)! } : null;
  const suggestions = buildSuggestions(
    ((alerts ?? []) as any[]).map((a) => ({ blockId: a.block_id, blockName: nameOf.get(a.block_id) ?? '', domain: a.domain, severity: a.severity })),
    ((recs ?? []) as any[]).map((r) => ({ id: r.id, blockId: r.block_id, blockName: r.block_id ? nameOf.get(r.block_id) ?? null : null, title: r.title })),
    pinned,
  );

  return {
    readOnly: await isFarmReadOnly(createAdminClient() as any, farmId),
    suggestions,
    blocks: blockList,
    recommendations: ((recs ?? []) as any[]).map((r) => ({ id: r.id, title: r.title, blockId: r.block_id })),
  };
}
