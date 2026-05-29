'use server';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { revalidatePath } from 'next/cache';
import { Database } from '@/utils/supabase/types';

type InsertEvent = Database['public']['Tables']['calendar_events']['Insert'];

export async function createEvent(
  data: Omit<InsertEvent, 'user_id' | 'created_at' | 'id'>,
  farmId: string,
): Promise<{ id: string }> {
  const supabase = await createClient();

  const { data: created, error } = await supabase
    .from('calendar_events')
    .insert(data)
    .select('id')
    .single();

  if (error) {
    console.error('Error creating event:', error);
    throw new Error('Failed to create event');
  }

  revalidatePath(`/${farmId}/calendar`);
  return { id: created.id };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function logEventCompletion(
  eventId: string,
  actualStart: Date,
  actualEnd: Date,
  notes: string,
  farmId: string,
) {
  const supabase = await createClient();
  const admin = createAdminClient();

  if (!UUID_RE.test(eventId)) {
    console.warn('[Calendar] Skipping completion log for mock event:', eventId);
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();

  const { data: existing } = await supabase
    .from('calendar_events')
    .select('title, type, block_id, details')
    .eq('id', eventId)
    .single();

  const mergedDetails = {
    ...(existing?.details as Record<string, unknown> ?? {}),
    actual_start: actualStart.toISOString(),
    actual_end: actualEnd.toISOString(),
  };

  const { error } = await supabase
    .from('calendar_events')
    .update({
      completed_at: actualEnd.toISOString(),
      notes: notes || null,
      details: mergedDetails,
    })
    .eq('id', eventId);

  if (error) {
    console.error('[Calendar] Error logging completion:', error.message);
    throw new Error(`Failed to log completion: ${error.message}`);
  }

  if (existing) {
    const validTypes = ['irrigation', 'fertigation', 'spraying', 'pruning', 'scouting', 'pollinating', 'tilling', 'plowing', 'weeding', 'tissue-sample', 'other'] as const;
    type ActivityType = typeof validTypes[number];
    const activityType: ActivityType = validTypes.includes(existing.type as ActivityType)
      ? (existing.type as ActivityType)
      : 'other';

    const { error: logError } = await admin.from('activity_log').insert({
      title: existing.title,
      activity_type: activityType,
      block_id: existing.block_id ?? null,
      description: notes || null,
      performed_at: actualEnd.toISOString(),
      performed_by: user?.id ?? null,
      calendar_event_id: eventId,
    });

    if (logError) {
      console.error('[Calendar] Failed to write activity_log:', logError.message);
    }
  }

  revalidatePath(`/${farmId}/calendar`);
  revalidatePath(`/${farmId}/activity`);
}
