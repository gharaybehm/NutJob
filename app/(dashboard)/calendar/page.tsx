import CalendarPage from '@/app/components/calendar/CalendarPage';
import { createClient } from '@/utils/supabase/server';
import { CalendarEvent, ActivityType } from '@/app/components/calendar/types';

export const metadata = {
  title: 'Calendar — NutJob',
  description: 'Farm calendar for irrigation, fertigation, spraying, pruning, and scouting events.',
};

export default async function CalendarRoute() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    // If not authenticated, standard redirect is handled by middleware but as a safeguard
    return null;
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .order('start_date', { ascending: true });

  // Map DB rows → CalendarEvent shape used by the UI
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

  return <CalendarPage initialEvents={initialEvents} userRole={profile?.role || 'worker'} />;
}
