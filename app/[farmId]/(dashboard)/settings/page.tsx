import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — SettingsForms lives in the old route group; its internal action imports resolve correctly
import SettingsForms from '@/app/(dashboard)/settings/SettingsForms'

export const metadata = {
  title: 'Settings — NutJob',
  description: 'Manage your account, team, blocks, alerts, sensors, and weather API.',
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ farmId: string }>;
}) {
  const { farmId } = await params;
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'worker') {
    redirect(`/${farmId}/dashboard?error=Unauthorized`)
  }

  const profileData = {
    email: user.email || '',
    full_name: user.user_metadata?.full_name || '',
    phone: user.user_metadata?.phone || '',
  }

  // Fetch users who are members of this farm
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: farmMemberRows = [] } = await db.from('farm_members')
    .select('user_id, role')
    .eq('farm_id', farmId);

  const memberIds = (farmMemberRows as { user_id: string; role: string }[]).map(m => m.user_id);

  const { data: allUsers = [] } = memberIds.length > 0
    ? await supabase
        .from('user_profiles')
        .select('id, full_name, phone, role, created_at')
        .in('id', memberIds)
        .order('created_at', { ascending: false })
    : { data: [] };

  // Fetch blocks scoped to this farm
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: blocks = [] } = await (supabase.from('blocks') as any)
    .select('id, name, crop_type, variety, area, area_unit, field_capacity, wilting_point, notes')
    .eq('farm_id', farmId)
    .order('name')

  // Fetch farm details for the Farm Identity and Weather sections
  const { data: farmData } = await db.from('farms')
    .select('name, address, gps_lat, gps_lng, sensecap_api_id, sensecap_access_key')
    .eq('id', farmId)
    .single()

  // Fetch sensors with their assigned block name
  const { data: sensorsRaw } = await db
    .from('sensors')
    .select('*, block:blocks(name)')
    .eq('farm_id', farmId)
    .order('created_at', { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sensors = ((sensorsRaw ?? []) as any[]).map((s: any) => ({
    ...s,
    block_name: s.block?.name ?? null,
    block: undefined,
  }))

  const t = await getTranslations('settings');

  return (
    <div className="max-w-5xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t('description')}
        </p>
      </div>

      <SettingsForms
        initialProfile={profileData}
        userRole={profile?.role || 'worker'}
        allUsers={allUsers as { id: string; full_name: string | null; phone: string | null; role: 'admin' | 'supervisor' | 'worker'; created_at: string }[]}
        blocks={blocks as { id: string; name: string; crop_type: string; variety: string; area: number; area_unit: string; field_capacity: number | null; wilting_point: number | null; notes: string | null }[]}
        farmId={farmId}
        farmName={farmData?.name ?? ''}
        farmAddress={farmData?.address ?? ''}
        farmGpsLat={farmData?.gps_lat ?? null}
        farmGpsLng={farmData?.gps_lng ?? null}
        sensors={sensors}
        initialSensecapApiId={farmData?.sensecap_api_id ?? null}
        initialSensecapAccessKey={farmData?.sensecap_access_key ?? null}
      />
    </div>
  )
}
