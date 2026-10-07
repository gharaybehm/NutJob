/* eslint-disable @typescript-eslint/no-explicit-any -- knowledge_requests is not in the generated Supabase types */
'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/utils/supabase/admin';
import { requireFarmRole } from '@/utils/supabase/farm-access';
import { fetchKnowledgeDocuments } from '@/utils/kb-coverage';
import { cleanRequestInput, gapFor, requestKeys, type KnowledgeRequest } from '@/utils/kb-requests';
import { sendPushToUsers } from '@/utils/push';

export interface RequestGuidesInput {
  cropType: string;
  variety: string | null;
  note?: string | null;
  link?: string | null;
}

/**
 * A farm's supervisor or admin asks the platform admin to load guides for a
 * crop or variety that has none. One request per farm for each gap: asking
 * again returns the one already made.
 */
export async function requestKnowledgeGuides(
  farmId: string,
  input: RequestGuidesInput,
): Promise<{ request?: KnowledgeRequest; error?: string }> {
  const gate = await requireFarmRole(farmId, 'supervisor');
  if (!gate.ok) return { error: gate.error };

  const cleaned = cleanRequestInput(input.note, input.link);
  if (cleaned.error) return { error: cleaned.error };

  const admin = createAdminClient();

  const docs = await fetchKnowledgeDocuments(admin);
  if (docs === null) return { error: 'The knowledge base could not be read. Try again later.' };

  const kind = gapFor(input.cropType, input.variety, docs);
  const keys = requestKeys(input.cropType, input.variety, kind);
  if (!kind || !keys) return { error: 'Guides are already loaded for this.' };

  // Only for something the farm grows, so the admin's list reflects real blocks.
  const { data: blocks, error: blocksError } = await (admin as any)
    .from('blocks')
    .select('crop_type, variety')
    .eq('farm_id', farmId);
  if (blocksError) return { error: blocksError.message };
  const grown = ((blocks ?? []) as { crop_type: string | null; variety: string | null }[]).some((b) => {
    const k = requestKeys(b.crop_type, b.variety, gapFor(b.crop_type, b.variety, docs));
    return k?.cropKey === keys.cropKey && k.varietyKey === keys.varietyKey;
  });
  if (!grown) return { error: 'No block on this farm has this crop and variety.' };

  const { data: existing } = await (admin as any)
    .from('knowledge_requests')
    .select('*')
    .eq('farm_id', farmId)
    .eq('crop_key', keys.cropKey)
    .eq('variety_key', keys.varietyKey)
    .neq('kind', 'question')
    .maybeSingle();
  if (existing) return { request: existing as KnowledgeRequest };

  const { data: created, error } = await (admin as any)
    .from('knowledge_requests')
    .insert({
      farm_id: farmId,
      requested_by: gate.actor.userId,
      crop_type: input.cropType.trim(),
      variety: kind === 'variety' ? (input.variety ?? '').trim() : null,
      crop_key: keys.cropKey,
      variety_key: keys.varietyKey,
      note: cleaned.note,
      link: cleaned.link,
    })
    .select('*')
    .single();
  if (error || !created) return { error: error?.message ?? 'The request could not be saved.' };

  // Tell the platform admins. Best effort: the request is saved either way, and
  // it is in their list whether or not a notification arrives.
  try {
    const { data: admins } = await (admin as any).from('user_profiles').select('id').eq('role', 'super_admin');
    const what = kind === 'variety' ? `${created.crop_type} ${created.variety}` : created.crop_type;
    await sendPushToUsers(((admins ?? []) as { id: string }[]).map((a) => a.id), {
      title: 'Guides requested',
      body: `A farm asked for knowledge-base guides on ${what}.`,
      url: '/admin/knowledge',
      tag: `knowledge-request-${created.id}`,
    });
  } catch (e) {
    console.error('[knowledge-requests] Could not notify the platform admins:', e);
  }

  revalidatePath(`/${farmId}/settings`);
  revalidatePath(`/${farmId}/blocks`);
  return { request: created as KnowledgeRequest };
}
