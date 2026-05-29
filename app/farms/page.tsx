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

  return <FarmPicker farms={farms} />;
}
