'use server';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { requireFarmRole } from '@/utils/supabase/farm-access';
import { revalidatePath } from 'next/cache';
import { Database } from '@/utils/supabase/types';

type InsertEvent = Database['public']['Tables']['calendar_events']['Insert'];

type PlannedMaterialInput = { consumableId: string; plannedQuantity: number };
type MaterialActualInput  = { consumableId: string; actualQuantity: number; currentBalance: number };

export async function createEvent(
  data: Omit<InsertEvent, 'user_id' | 'created_at' | 'id'>,
  farmId: string,
  materials: PlannedMaterialInput[] = [],
): Promise<{ id: string }> {
  // Scheduling work for other people is a supervisor duty; RLS enforces the
  // same rule, this just fails with a readable message.
  const gate = await requireFarmRole(farmId, 'supervisor');
  if (!gate.ok) throw new Error(gate.error);

  const supabase = await createClient();

  const { data: created, error } = await supabase
    .from('calendar_events')
    // farm_id is what scopes the event. Without it the row is farm-wide and,
    // before 20260909000000_tenant_isolation.sql, showed up for every tenant.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- farm_id predates the generated types
    .insert({ ...data, farm_id: farmId } as any)
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
  materialActuals: MaterialActualInput[] = [],
) {
  // Any member may close out work assigned to them, so 'worker' is the floor.
  const gate = await requireFarmRole(farmId, 'worker');
  if (!gate.ok) throw new Error(gate.error);
  const actor = gate.actor;

  const supabase = await createClient();
  const admin = createAdminClient();

  if (!UUID_RE.test(eventId)) {
    console.warn('[Calendar] Skipping completion log for mock event:', eventId);
    return;
  }

  const user = { id: actor.userId };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- farm_id predates the generated types
  const { data: existing } = await (supabase.from('calendar_events') as any)
    .select('title, type, block_id, details, farm_id')
    .eq('id', eventId)
    .single();

  // The activity_log write below goes through the service-role client, which
  // ignores RLS — so confirm the event really belongs to this farm rather than
  // trusting the farmId the client sent.
  if (existing && existing.farm_id && existing.farm_id !== farmId) {
    throw new Error('That event belongs to another farm.');
  }

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- farm_id predates the generated types
    const { error: logError } = await (admin.from('activity_log') as any).insert({
      farm_id: farmId,
      title: existing.title,
      activity_type: activityType,
      block_id: existing.block_id ?? null,
      description: notes || null,
      performed_at: actualEnd.toISOString(),
      performed_by: user.id,
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
          entry_type: 'usage',
          balance_after: liveBalance - mat.actualQuantity,
          calendar_event_id: eventId,
          notes: 'Auto-deducted on task completion',
          logged_by: user.id,
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
    revalidatePath(`/${farmId}/inventory`);
  }

  revalidatePath(`/${farmId}/calendar`);
  revalidatePath(`/${farmId}/activity`);
}
