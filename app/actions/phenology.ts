/* eslint-disable @typescript-eslint/no-explicit-any -- phenology_events is not in the generated Supabase types */
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';

// A "use server" file may only export async functions, so the event-type list
// and the row types live in ./phenology-types and are imported here.
import { PHENOLOGY_EVENT_TYPES } from './phenology-types';
import type { PhenologyEventType, PhenologyEvent } from './phenology-types';

/**
 * The season an observation belongs to. Northern-hemisphere almond seasons run
 * within a calendar year, so the observed year is the season; a grower south of
 * the equator can correct the stored value by re-logging.
 */
function seasonForDate(observedOn: string): number {
  const year = Number(observedOn.slice(0, 4));
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

async function assertCanWrite(farmId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'Not signed in.';

  // Per-farm role is authoritative — the global user_profiles.role is not.
  const { data: membership } = await (supabase as any)
    .from('farm_members')
    .select('role')
    .eq('farm_id', farmId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) return 'You are not a member of this farm.';
  if (membership.role === 'worker') return 'Workers cannot log phenology observations.';
  return null;
}

export async function logPhenologyEvent(formData: FormData): Promise<{ error?: string }> {
  const farmId     = (formData.get('farmId')     as string || '').trim();
  const blockId    = (formData.get('blockId')    as string || '').trim();
  const eventType  = (formData.get('eventType')  as string || '').trim();
  const observedOn = (formData.get('observedOn') as string || '').trim();
  const notes      = (formData.get('notes')      as string || '').trim();

  if (!farmId || !blockId) return { error: 'Missing farm or block.' };
  if (!observedOn) return { error: 'An observation date is required.' };
  if (!PHENOLOGY_EVENT_TYPES.includes(eventType as PhenologyEventType)) {
    return { error: 'Unknown event type.' };
  }

  // An observation is a record of something already seen — a future date is
  // always a data-entry slip, and would silently corrupt GDD accumulation.
  const today = new Date().toISOString().split('T')[0];
  if (observedOn > today) return { error: 'Observation date cannot be in the future.' };

  const denied = await assertCanWrite(farmId);
  if (denied) return { error: denied };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await (supabase as any)
    .from('phenology_events')
    .upsert({
      farm_id:     farmId,
      block_id:    blockId,
      event_type:  eventType,
      observed_on: observedOn,
      season:      seasonForDate(observedOn),
      notes:       notes || null,
      observed_by: user?.id ?? null,
    }, { onConflict: 'block_id,event_type,season' });

  if (error) return { error: error.message };

  revalidatePath(`/${farmId}/blocks`);
  return {};
}

export async function getPhenologyEvents(blockId: string): Promise<{
  data: PhenologyEvent[] | null;
  error?: string;
}> {
  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from('phenology_events')
    .select('id, block_id, event_type, observed_on, season, notes, created_at')
    .eq('block_id', blockId)
    .order('observed_on', { ascending: false })
    .limit(50);

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as PhenologyEvent[] };
}

export async function deletePhenologyEvent(
  id: string,
  farmId: string,
): Promise<{ error?: string }> {
  const denied = await assertCanWrite(farmId);
  if (denied) return { error: denied };

  const supabase = await createClient();
  const { error } = await (supabase as any)
    .from('phenology_events')
    .delete()
    .eq('id', id)
    .eq('farm_id', farmId);

  if (error) return { error: error.message };

  revalidatePath(`/${farmId}/blocks`);
  return {};
}
