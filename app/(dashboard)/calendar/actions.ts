'use server';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { revalidatePath } from 'next/cache';
import { Database } from '@/utils/supabase/types';

type InsertEvent = Database['public']['Tables']['calendar_events']['Insert'];

type PlannedMaterialInput = { consumableId: string; plannedQuantity: number };
type MaterialActualInput  = { consumableId: string; actualQuantity: number; currentBalance: number };

export async function createEvent(
  data: Omit<InsertEvent, 'user_id' | 'created_at' | 'id'>,
  materials: PlannedMaterialInput[] = [],
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

  if (materials.length > 0) {
    const { error: matError } = await supabase
      .from('calendar_event_materials')
      .insert(materials.map((m) => ({
        calendar_event_id: created.id,
        consumable_id: m.consumableId,
        planned_quantity: m.plannedQuantity,
      })));
    if (matError) {
      console.error('[Calendar] Failed to insert event materials:', matError.message);
    }
  }

  revalidatePath('/calendar');
  return { id: created.id };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function logEventCompletion(
  eventId: string,
  actualStart: Date,
  actualEnd: Date,
  notes: string,
  materialActuals: MaterialActualInput[] = [],
) {
  const supabase = await createClient();
  const admin = createAdminClient();

  // Mock events (non-UUID ids) only exist in local state — skip DB writes
  if (!UUID_RE.test(eventId)) {
    console.warn('[Calendar] Skipping completion log for mock event:', eventId);
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();

  // Fetch existing event so we can merge details and write to activity_log
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

  // Write to activity_log via admin client to bypass RLS
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

  // Deduct inventory for each material used
  if (materialActuals.length > 0) {
    const usageDate = actualEnd.toISOString().split('T')[0];
    for (const mat of materialActuals) {
      if (mat.actualQuantity <= 0) continue;

      // Re-fetch live balance to avoid stale-read races
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cons } = await (supabase as any)
        .from('consumables')
        .select('current_balance')
        .eq('id', mat.consumableId)
        .single();
      const liveBalance = cons ? Number(cons.current_balance) : mat.currentBalance;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: usageError } = await (supabase as any)
        .from('consumable_usage_log')
        .insert({
          consumable_id: mat.consumableId,
          usage_date: usageDate,
          quantity: mat.actualQuantity,
          calendar_event_id: eventId,
          notes: 'Auto-deducted on task completion',
          logged_by: user?.id ?? null,
        });
      if (usageError) {
        console.error('[Calendar] Failed to log consumable usage:', usageError.message);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: balError } = await (supabase as any)
        .from('consumables')
        .update({ current_balance: liveBalance - mat.actualQuantity })
        .eq('id', mat.consumableId);
      if (balError) {
        console.error('[Calendar] Failed to update consumable balance:', balError.message);
      }
    }
    revalidatePath('/inventory');
  }

  revalidatePath('/calendar');
  revalidatePath('/activity');
}
