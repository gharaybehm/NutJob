import CalendarPage from '@/app/components/calendar/CalendarPage';
import { createClient } from '@/utils/supabase/server';
import { CalendarEvent, ActivityType } from '@/app/components/calendar/types';

export const metadata = {
  title: 'Calendar — NutJob',
  description: 'Farm calendar for irrigation, fertigation, spraying, pruning, and scouting events.',
};

export default async function CalendarRoute({ params }: { params: Promise<{ farmId: string }> }) {
  const { farmId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) return null;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  // Fetch block IDs for this farm to scope calendar events
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: farmBlocks } = await (supabase.from('blocks') as any)
    .select('id')
    .eq('farm_id', farmId);
  const blockIds: string[] = (farmBlocks ?? []).map((b: { id: string }) => b.id);

  // Fetch events for this farm's blocks (or farm-wide events with no block)
  let eventsQuery = supabase
    .from('calendar_events')
    .select('*')
    .order('start_date', { ascending: true });

  if (blockIds.length > 0) {
    eventsQuery = eventsQuery.or(`block_id.in.(${blockIds.join(',')}),block_id.is.null`);
  } else {
    eventsQuery = eventsQuery.is('block_id', null);
  }

  const { data, error } = await eventsQuery;

  const initialEvents: CalendarEvent[] = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type as ActivityType,
    startDate: new Date(row.start_date),
    endDate: new Date(row.end_date),
    block: row.block ?? undefined,
    notes: row.notes ?? undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    details: row.details as CalendarEvent['details'] ?? undefined,
  }));

  if (error) {
    console.error('[Calendar] Failed to fetch events:', error.message);
  }

  return <CalendarPage initialEvents={initialEvents} userRole={profile?.role || 'worker'} farmId={farmId} />;
}
