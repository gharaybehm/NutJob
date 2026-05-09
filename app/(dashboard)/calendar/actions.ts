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

  // We only really have completed_at in our table, 
  // but we can store actualStart and actualEnd in the 'details' JSON field or 'notes'.
  // Since we don't have separate columns for actual_start/actual_end in the schema,
  // let's update 'completed_at' to the actualEnd, and put the rest in notes.
  const completionNotes = `Actual Start: ${actualStart.toLocaleString('en-GB')}\nActual End: ${actualEnd.toLocaleString('en-GB')}\n\n${notes}`;

  const { error } = await supabase
    .from('calendar_events')
    .update({
      completed_at: actualEnd.toISOString(),
      notes: completionNotes
    })
    .eq('id', eventId);

  if (error) {
    console.error('Error logging completion:', error);
    throw new Error('Failed to log completion');
  }

  revalidatePath('/calendar');
}
