'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import type { FarmWithMeta } from '@/utils/supabase/farm-types';

function toSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'farm'
  );
}

export async function createFarm(values: {
  name: string;
  address?: string;
  gps_lat?: number | null;
  gps_lng?: number | null;
  gps_zoom?: number | null;
}): Promise<{ farmId?: string; error?: string }> {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Not authenticated' };

  // Enforce 3-farm maximum
  const { count } = await (supabase as any)
    .from('farm_members')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);
  if ((count ?? 0) >= 3) {
    return { error: 'You have reached the maximum of 3 farms.' };
  }

  const slug = toSlug(values.name);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertFarm = async (s: string) =>
    (admin as any).from('farms').insert({
      name: values.name.trim(),
      slug: s,
      created_by: user.id,
      address: values.address?.trim() || null,
      gps_lat: values.gps_lat ?? null,
      gps_lng: values.gps_lng ?? null,
      gps_zoom: values.gps_zoom ?? 14,
    }).select('id').single();

  let { data: farm, error: farmError } = await insertFarm(slug);

  if (farmError) {
    if (farmError.code === '23505') {
      // Slug collision — append a short random suffix and retry once
      const retrySlug = `${slug}-${Date.now().toString(36)}`;
      const retry = await insertFarm(retrySlug);
      farm = retry.data;
      farmError = retry.error;
    }
    if (farmError) return { error: farmError.message };
  }

  // Add creator as admin member
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: memberError } = await (admin as any).from('farm_members').insert({
    farm_id: farm!.id,
    user_id: user.id,
    role: 'admin',
  });

  if (memberError) return { error: memberError.message };

  revalidatePath('/farms');
  return { farmId: farm!.id };
}

export async function getFarms(): Promise<FarmWithMeta[]> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: farmsRaw } = await db.from('farms')
    .select('*, farm_members(role, user_id)')
    .order('created_at');

  if (!farmsRaw || farmsRaw.length === 0) return [];

  const farmIds = farmsRaw.map((f: { id: string }) => f.id);

  const { data: blockRows } = await db.from('blocks')
    .select('farm_id')
    .in('farm_id', farmIds);

  const countMap: Record<string, number> = {};
  (blockRows ?? []).forEach((b: { farm_id: string }) => {
    countMap[b.farm_id] = (countMap[b.farm_id] ?? 0) + 1;
  });

  return farmsRaw.map((f: { id: string; farm_members: { user_id: string; role: string }[] } & Record<string, unknown>) => ({
    ...f,
    blockCount: countMap[f.id] ?? 0,
    userRole: f.farm_members?.find((m) => m.user_id === user.id)?.role ?? 'worker',
  })) as FarmWithMeta[];
}

export async function deleteFarm(farmId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: membership } = await (supabase as any).from('farm_members')
    .select('role')
    .eq('farm_id', farmId)
    .eq('user_id', user.id)
    .single();

  if (membership?.role !== 'admin') return { error: 'Only admins can delete farms' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from('farms').delete().eq('id', farmId);
  if (error) return { error: error.message };

  revalidatePath('/farms');
  return {};
}

export async function updateFarm(
  farmId: string,
  values: {
    name?: string;
    address?: string;
    gps_lat?: number | null;
    gps_lng?: number | null;
    gps_zoom?: number | null;
    total_area?: number | null;
    area_unit?: string;
  }
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('farms')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', farmId);

  if (error) return { error: error.message };

  revalidatePath('/farms');
  revalidatePath(`/${farmId}/settings`);
  revalidatePath(`/${farmId}/dashboard`);
  return {};
}
