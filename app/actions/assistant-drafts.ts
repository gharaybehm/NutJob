/* eslint-disable @typescript-eslint/no-explicit-any -- the assistant tables are not in the generated Supabase types yet */
'use server';

// The field assistant's one write: a draft card accepted (and scheduled),
// edited and accepted, or dismissed with a reason; and "Request guides" from
// an answer with no source. Requirements.md, Field assistant: Draft cards and
// Knowledge gaps.
//
// Every action re-reads the draft from the database: the browser sends only
// the message id and the draft's index, never the card itself, so a tampered
// request cannot change the block, category or text that is written.

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/utils/supabase/admin';
import { requireFarmRole } from '@/utils/supabase/farm-access';
import { isFarmReadOnly } from '@/utils/farm-status';
import { bookingWindow, bookRecommendationEvent, type ScheduleInput } from '@/utils/recommendation-schedule';
import { DRAFT_CATEGORIES, MAX_DRAFTS, type AssistantDraft, type DraftState } from '@/utils/assistant/drafts';
import { canRequestGuidesFor } from '@/utils/assistant/types';
import { fetchKnowledgeDocuments } from '@/utils/kb-coverage';
import { gapFor, requestKeys } from '@/utils/kb-requests';
import { sendPushToUsers } from '@/utils/push';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SKIP_REASONS = ['already_done', 'disagree', 'no_resources'] as const;
type SkipReason = (typeof SKIP_REASONS)[number];

/** Questions kept on one gap request, and open question-level requests per farm. */
const MAX_QUESTIONS_PER_REQUEST = 20;
const MAX_OPEN_QUESTION_REQUESTS = 5;

type ActionResult = { ok?: true; error?: string; code?: 'read_only' | 'already' | 'not_found' | 'forbidden' | 'limit' | 'invalid' };

interface LoadedDraft {
  admin: any;
  actorId: string;
  message: { id: string; thread_id: string; model: string | null; draft_states: Record<string, DraftState> };
  draft: AssistantDraft;
}

/**
 * The caller's own draft on this farm, read fresh from the database. Only the
 * conversation's owner may act on it: a farm admin reads others' conversations
 * but does not accept for them.
 */
async function loadDraft(farmId: string, messageId: string, draftIndex: number): Promise<LoadedDraft | ActionResult> {
  if (!UUID.test(messageId) || !Number.isInteger(draftIndex) || draftIndex < 0 || draftIndex >= MAX_DRAFTS) {
    return { error: 'Not found.', code: 'not_found' };
  }
  const gate = await requireFarmRole(farmId, 'supervisor');
  if (!gate.ok) return { error: gate.error, code: 'forbidden' };

  const admin = createAdminClient() as any;
  const { data: msg } = await admin
    .from('assistant_messages')
    .select('id, thread_id, user_id, role, model, drafts, draft_states')
    .eq('id', messageId)
    .eq('farm_id', farmId)
    .maybeSingle();
  if (!msg || msg.role !== 'assistant') return { error: 'Not found.', code: 'not_found' };
  if (msg.user_id !== gate.actor.userId) return { error: 'Only the person who asked can act on this card.', code: 'forbidden' };

  const draft = (Array.isArray(msg.drafts) ? msg.drafts : [])[draftIndex] as AssistantDraft | undefined;
  if (!draft) return { error: 'Not found.', code: 'not_found' };
  if (!DRAFT_CATEGORIES.includes(draft.category)) return { error: 'This card cannot be used.', code: 'invalid' };
  // A quick check only; the unique index on (assistant_message_id, draft_index) is the real guard.
  if ((msg.draft_states ?? {})[String(draftIndex)]) return { error: 'This card was already handled.', code: 'already' };

  // The block must still be this farm's (it may have been deleted or moved since).
  const { data: block } = await admin.from('blocks').select('id').eq('id', draft.block_id).eq('farm_id', farmId).maybeSingle();
  if (!block) return { error: 'The block on this card is no longer on the farm.', code: 'invalid' };

  return {
    admin,
    actorId: gate.actor.userId,
    message: { id: msg.id, thread_id: msg.thread_id, model: msg.model ?? null, draft_states: msg.draft_states ?? {} },
    draft,
  };
}

function isLoaded(x: LoadedDraft | ActionResult): x is LoadedDraft {
  return 'draft' in x;
}

async function recordState(admin: any, messageId: string, states: Record<string, DraftState>, key: string, state: DraftState) {
  const { error } = await admin.from('assistant_messages').update({ draft_states: { ...states, [key]: state } }).eq('id', messageId);
  if (error) console.error('[assistant] draft state update failed:', error.code ?? 'unknown');
}

async function logEvent(admin: any, farmId: string, userId: string, kind: string, category: string | null = null) {
  await admin.from('assistant_events').insert({ farm_id: farmId, user_id: userId, kind, category });
}

function revalidate(farmId: string) {
  revalidatePath(`/${farmId}/recommendations`);
  revalidatePath(`/${farmId}/calendar`);
  revalidatePath(`/${farmId}/dashboard`);
}

/**
 * "Accept and schedule": records the draft as an accepted recommendation (or
 * edited, when the title or a note was changed) marked as coming from the
 * assistant, and books the calendar entry exactly as accepting a weekly card
 * does. Never pending, so the weekly run's expiry of pending cards does not
 * touch it. Block state changes only when the entry is logged as completed.
 */
export async function acceptAssistantDraft(
  farmId: string,
  messageId: string,
  draftIndex: number,
  schedule: ScheduleInput,
  edits?: { title?: string; note?: string },
): Promise<ActionResult & { recommendationId?: string }> {
  const loaded = await loadDraft(farmId, messageId, draftIndex);
  if (!isLoaded(loaded)) return loaded;
  const { admin, actorId, message, draft } = loaded;

  if (await isFarmReadOnly(admin, farmId)) {
    return { error: 'This farm is read-only while its subscription is overdue.', code: 'read_only' };
  }
  try {
    bookingWindow(draft.category, schedule);
  } catch {
    return { error: 'Choose a valid start time.', code: 'invalid' };
  }

  const title = (typeof edits?.title === 'string' ? edits.title.trim().replace(/\s+/g, ' ').slice(0, 120) : '') || draft.title;
  const note = (typeof edits?.note === 'string' ? edits.note.trim().slice(0, 1000) : '') || null;
  const edited = title !== draft.title || note !== null;
  const now = new Date().toISOString();

  const { data: rec, error } = await admin
    .from('recommendations')
    .insert({
      farm_id: farmId,
      block_id: draft.block_id,
      category: draft.category,
      title,
      rationale: draft.rationale,
      confidence: Math.min(1, Math.max(0, draft.confidence / 100)),
      status: edited ? 'edited' : 'accepted',
      acted_at: now,
      acted_by: actorId,
      manager_note: note,
      llm_model: draft.from_calculation ? null : message.model,
      sources: draft.sources.map((s) => ({ title: s.title, section: s.section })),
      reference_status: draft.reference_status,
      expires_at: null,
      origin: 'assistant',
      assistant_message_id: message.id,
      draft_index: draftIndex,
    })
    .select('id')
    .single();
  if (error || !rec) {
    // The unique index on (assistant_message_id, draft_index): a second accept of the same card.
    if (error?.code === '23505') return { error: 'This card was already handled.', code: 'already' };
    console.error('[assistant] draft insert failed:', error?.code ?? 'unknown');
    return { error: 'The card could not be saved.' };
  }

  try {
    await bookRecommendationEvent(
      farmId,
      actorId,
      { id: rec.id, title, category: draft.category, block_id: draft.block_id, rationale: draft.rationale },
      schedule,
      title,
    );
  } catch (e) {
    // No calendar entry, no accepted card: undo the insert so the draft can be tried again.
    await admin.from('recommendations').delete().eq('id', rec.id).eq('farm_id', farmId);
    console.error('[assistant] draft booking failed:', e instanceof Error ? e.name : 'unknown');
    return { error: 'The calendar entry could not be booked.' };
  }

  await recordState(admin, message.id, message.draft_states, String(draftIndex), {
    state: edited ? 'edited' : 'accepted',
    recommendation_id: rec.id,
    at: now,
  });
  await logEvent(admin, farmId, actorId, 'draft_accepted', draft.category);
  revalidate(farmId);
  return { ok: true, recommendationId: rec.id };
}

/** Dismissing a draft with a reason records it as a skipped recommendation, so the weekly run sees it. */
export async function dismissAssistantDraft(
  farmId: string,
  messageId: string,
  draftIndex: number,
  reason: SkipReason | null,
): Promise<ActionResult> {
  if (reason !== null && !SKIP_REASONS.includes(reason)) return { error: 'Unknown reason.', code: 'invalid' };
  const loaded = await loadDraft(farmId, messageId, draftIndex);
  if (!isLoaded(loaded)) return loaded;
  const { admin, actorId, message, draft } = loaded;
  const now = new Date().toISOString();

  const { data: rec, error } = await admin
    .from('recommendations')
    .insert({
      farm_id: farmId,
      block_id: draft.block_id,
      category: draft.category,
      title: draft.title,
      rationale: draft.rationale,
      confidence: Math.min(1, Math.max(0, draft.confidence / 100)),
      status: 'skipped',
      acted_at: now,
      acted_by: actorId,
      manager_note: reason ? `skip_reason:${reason}` : null,
      llm_model: draft.from_calculation ? null : message.model,
      sources: draft.sources.map((s) => ({ title: s.title, section: s.section })),
      reference_status: draft.reference_status,
      expires_at: null,
      origin: 'assistant',
      assistant_message_id: message.id,
      draft_index: draftIndex,
    })
    .select('id')
    .single();
  if (error || !rec) {
    if (error?.code === '23505') return { error: 'This card was already handled.', code: 'already' };
    console.error('[assistant] draft dismiss failed:', error?.code ?? 'unknown');
    return { error: 'The card could not be saved.' };
  }

  await recordState(admin, message.id, message.draft_states, String(draftIndex), {
    state: 'dismissed',
    recommendation_id: rec.id,
    reason,
    at: now,
  });
  await logEvent(admin, farmId, actorId, 'draft_dismissed', reason);
  revalidate(farmId);
  return { ok: true };
}

/**
 * "Request guides" from an answer with no source. A question about a crop or
 * variety with no guides is added to the farm's one request for that gap; a
 * question the loaded guides did not cover becomes a question-level request,
 * which the platform operator closes by hand. Sending it shares the question
 * with the platform team, and the drawer says so before it is sent.
 */
export async function requestGuidesFromAssistant(
  farmId: string,
  messageId: string,
): Promise<ActionResult & { kind?: 'gap' | 'question' }> {
  if (!UUID.test(messageId)) return { error: 'Not found.', code: 'not_found' };
  const gate = await requireFarmRole(farmId, 'supervisor');
  if (!gate.ok) return { error: gate.error, code: 'forbidden' };
  const admin = createAdminClient() as any;

  const { data: msg } = await admin
    .from('assistant_messages')
    .select('id, thread_id, user_id, role, reference_status, search_scope, draft_states, created_at')
    .eq('id', messageId)
    .eq('farm_id', farmId)
    .maybeSingle();
  if (!msg || msg.role !== 'assistant') return { error: 'Not found.', code: 'not_found' };
  if (msg.user_id !== gate.actor.userId) return { error: 'Only the person who asked can send this.', code: 'forbidden' };
  if (!canRequestGuidesFor(msg.reference_status ?? null, msg.search_scope)) return { error: 'This answer cannot be sent.', code: 'invalid' };
  if ((msg.draft_states ?? {}).guides) return { error: 'Already sent.', code: 'already' };

  const scope = msg.search_scope as { crop: string; cropType: string; variety: string | null };
  // The farm must still grow it.
  const { data: blocks } = await admin.from('blocks').select('crop_type, variety').eq('farm_id', farmId);
  const grown = ((blocks ?? []) as { crop_type: string | null; variety: string | null }[]).some(
    (b) => requestKeys(b.crop_type, null, 'crop')?.cropKey === requestKeys(scope.cropType, null, 'crop')?.cropKey,
  );
  if (!grown) return { error: 'No block on this farm grows this crop any more.', code: 'invalid' };

  const { data: q } = await admin
    .from('assistant_messages')
    .select('content')
    .eq('thread_id', msg.thread_id)
    .eq('role', 'user')
    .lte('created_at', msg.created_at)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const question = String(q?.content ?? '').trim().slice(0, 2000);
  if (!question) return { error: 'Not found.', code: 'not_found' };

  const docs = await fetchKnowledgeDocuments(admin);
  if (docs === null) return { error: 'The knowledge base could not be read. Try again later.' };
  const gap = gapFor(scope.cropType, scope.variety, docs);
  const keys = requestKeys(scope.cropType, scope.variety, gap);
  let kind: 'gap' | 'question';
  let requestId: string;

  if (gap && keys) {
    kind = 'gap';
    const { data: existing } = await admin
      .from('knowledge_requests')
      .select('id, questions')
      .eq('farm_id', farmId)
      .eq('kind', 'gap')
      .eq('crop_key', keys.cropKey)
      .eq('variety_key', keys.varietyKey)
      .maybeSingle();
    if (existing) {
      const questions = (Array.isArray(existing.questions) ? existing.questions : []) as string[];
      if (!questions.includes(question)) {
        const next = [...questions, question].slice(-MAX_QUESTIONS_PER_REQUEST);
        const { error } = await admin.from('knowledge_requests').update({ questions: next }).eq('id', existing.id);
        if (error) return { error: 'The request could not be saved.' };
      }
      requestId = existing.id;
    } else {
      const { data: created, error } = await admin
        .from('knowledge_requests')
        .insert({
          farm_id: farmId,
          requested_by: gate.actor.userId,
          crop_type: scope.cropType.trim(),
          variety: gap === 'variety' ? (scope.variety ?? '').trim() : null,
          crop_key: keys.cropKey,
          variety_key: keys.varietyKey,
          kind: 'gap',
          origin: 'assistant',
          questions: [question],
        })
        .select('id')
        .single();
      if (error || !created) return { error: 'The request could not be saved.' };
      requestId = created.id;
    }
  } else {
    kind = 'question';
    const { count } = await admin
      .from('knowledge_requests')
      .select('id', { count: 'exact', head: true })
      .eq('farm_id', farmId)
      .eq('kind', 'question')
      .in('status', ['open', 'in_progress']);
    if ((count ?? 0) >= MAX_OPEN_QUESTION_REQUESTS) {
      return { error: 'This farm already has several open questions with the platform team. Try again once they are answered.', code: 'limit' };
    }
    const { data: created, error } = await admin
      .from('knowledge_requests')
      .insert({
        farm_id: farmId,
        requested_by: gate.actor.userId,
        crop_type: scope.cropType.trim(),
        variety: scope.variety,
        crop_key: scope.crop,
        variety_key: '',
        kind: 'question',
        origin: 'assistant',
        question,
      })
      .select('id')
      .single();
    if (error || !created) return { error: 'The request could not be saved.' };
    requestId = created.id;
  }

  await recordState(admin, msg.id, msg.draft_states ?? {}, 'guides', { state: 'guides_requested', request_kind: kind, at: new Date().toISOString() });
  await logEvent(admin, farmId, gate.actor.userId, 'guides_requested', kind);

  // Tell the platform admins; best effort, the request is in their queue either way.
  try {
    const { data: admins } = await admin.from('user_profiles').select('id').eq('role', 'super_admin');
    await sendPushToUsers(((admins ?? []) as { id: string }[]).map((a) => a.id), {
      title: 'Guides requested from the assistant',
      body: `A farm asked about ${scope.cropType}${scope.variety ? ` ${scope.variety}` : ''}.`,
      url: '/admin/knowledge',
      tag: `knowledge-request-${requestId}`,
    });
  } catch (e) {
    console.error('[assistant] Could not notify the platform admins:', e instanceof Error ? e.name : 'unknown');
  }

  revalidatePath(`/${farmId}/settings`);
  revalidatePath(`/${farmId}/blocks`);
  return { ok: true, kind };
}
