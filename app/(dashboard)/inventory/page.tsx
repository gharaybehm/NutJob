import { getAssets, getConsumables, getRecentCalendarEvents } from './actions';
import { createClient } from '@/utils/supabase/server';
import InventoryPage from '@/app/components/inventory/InventoryPage';

export const metadata = {
  title: 'Inventory | NutJob',
  description: 'Farm asset and consumable inventory management',
};

export default async function InventoryRoute() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch role
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  // Fetch blocks for dropdowns
  const { data: blocksData } = await supabase
    .from('blocks')
    .select('name')
    .order('name', { ascending: true });
    
  const blockNames = (blocksData || []).map(b => b.name);

  // Fetch initial data
  const [assets, consumables, recentEvents] = await Promise.all([
    getAssets(),
    getConsumables(),
    getRecentCalendarEvents()
  ]);

  return (
    <InventoryPage 
      initialAssets={assets} 
      initialConsumables={consumables} 
      recentCalendarEvents={recentEvents}
      userRole={profile?.role || 'worker'}
      blocks={blockNames}
    />
  );
}
