'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { Database } from '@/utils/supabase/types';

type InsertEvent = Database['public']['Tables']['calendar_events']['Insert'];

export async function createEvent(data: Omit<InsertEvent, 'user_id' | 'created_at' | 'id'>) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('calendar_events')
    .insert(data);

  if (error) {
    console.error('Error creating event:', error);
    throw new Error('Failed to create event');
  }

  revalidatePath('/calendar');
}

export async function logEventCompletion(eventId: string, actualStart: Date, actualEnd: Date, notes: string) {
  const supabase = await createClient();

  // Fetch existing details so we can merge completion data into the JSONB field
  const { data: existing } = await supabase
    .from('calendar_events')
    .select('details')
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

  revalidatePath('/calendar');
}
