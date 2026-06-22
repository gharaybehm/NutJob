import CalendarPage from '@/app/components/calendar/CalendarPage';
import { createClient } from '@/utils/supabase/server';
import { CalendarEvent, ActivityType, MaterialLine } from '@/app/components/calendar/types';

export const metadata = {
  title: 'Calendar — RootLoot',
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

  if (error) {
    console.error('[Calendar] Failed to fetch events:', error.message);
  }

  // Fetch consumables for the materials picker in AddEventModal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: consumablesData } = await (supabase as any)
    .from('consumables')
    .select('id, name, unit, current_balance, category')
    .order('name', { ascending: true });

  const consumables: { id: string; name: string; unit: string; currentBalance: number; category: string }[] =
    (consumablesData ?? []).map((c: { id: string; name: string; unit: string; current_balance: number; category: string }) => ({
      id: c.id,
      name: c.name,
      unit: c.unit,
      currentBalance: Number(c.current_balance),
      category: c.category,
    }));

  // Fetch planned materials for all events and join with consumable details
  const eventIds: string[] = (data ?? []).map((row) => row.id);
  const materialsMap = new Map<string, MaterialLine[]>();

  if (eventIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: mats } = await (supabase as any)
      .from('calendar_event_materials')
      .select('id, calendar_event_id, planned_quantity, consumables(id, name, unit, current_balance)')
      .in('calendar_event_id', eventIds);

    for (const m of mats ?? []) {
      const cons = m.consumables as { id: string; name: string; unit: string; current_balance: number } | null;
      if (!cons) continue;
      const line: MaterialLine = {
        id: m.id,
        consumableId: cons.id,
        consumableName: cons.name,
        unit: cons.unit,
        plannedQuantity: Number(m.planned_quantity),
        currentBalance: Number(cons.current_balance),
      };
      const arr = materialsMap.get(m.calendar_event_id) ?? [];
      arr.push(line);
      materialsMap.set(m.calendar_event_id, arr);
    }
  }

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
    materials: materialsMap.get(row.id) ?? [],
  }));

  return <CalendarPage initialEvents={initialEvents} consumables={consumables} userRole={profile?.role || 'worker'} farmId={farmId} />;
}
