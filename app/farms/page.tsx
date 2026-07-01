import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import FarmPicker from '@/app/components/farms/FarmPicker';
import { getFarms } from '@/app/actions/farms';

export const metadata = {
  title: 'Your Farms — RootLoot',
};

export default async function FarmsPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) redirect('/login');

  const farms = await getFarms();

  // Single farm: skip the picker and go straight in
  if (farms.length === 1) {
    redirect(`/${farms[0].id}/dashboard`);
  }

  const userName = (user.user_metadata?.full_name || user.user_metadata?.name || user.email) as string | undefined;

  return <FarmPicker farms={farms} userName={userName} />;
}
