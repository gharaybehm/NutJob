import { getAssets, getConsumables, getRecentCalendarEvents } from './actions';
import { createClient } from '@/utils/supabase/server';
import InventoryPage from '@/app/components/inventory/InventoryPage';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Inventory | RootLoot',
  description: 'Farm asset and consumable inventory management',
};

export default async function InventoryRoute({
  params,
}: {
  params: Promise<{ farmId: string }>;
}) {
  const { farmId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  // Fetch block names scoped to this farm
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: blocksData } = await (supabase.from('blocks') as any)
    .select('name')
    .eq('farm_id', farmId)
    .order('name', { ascending: true });

  const blockNames = (blocksData || []).map((b: { name: string }) => b.name);

  const [assets, consumables, recentEvents] = await Promise.all([
    getAssets(),
    getConsumables(),
    getRecentCalendarEvents(farmId)
  ]);

  return (
    <InventoryPage
      initialAssets={assets}
      initialConsumables={consumables}
      recentCalendarEvents={recentEvents}
      userRole={profile?.role || 'worker'}
      blocks={blockNames}
      farmId={farmId}
    />
  );
}
