import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import FarmPicker from '@/app/components/farms/FarmPicker';
import { getFarms } from '@/app/actions/farms';

export const metadata = {
  title: 'Your Farms — NutJob',
};

export default async function FarmsPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) redirect('/login');

  const farms = await getFarms();

  // If user already has farms, go straight to the first one — tabs handle switching
  if (farms.length > 0) {
    redirect(`/${farms[0].id}/dashboard`);
  }

  return <FarmPicker farms={farms} />;
}
