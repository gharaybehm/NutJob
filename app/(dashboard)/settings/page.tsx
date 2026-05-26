import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import SettingsForms from './SettingsForms'

export const metadata = {
  title: 'Settings — NutJob',
  description: 'Manage your account, team, blocks, alerts, sensors, and weather API.',
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'worker') {
    redirect('/dashboard?error=Unauthorized')
  }

  const profileData = {
    email: user.email || '',
    full_name: user.user_metadata?.full_name || '',
    phone: user.user_metadata?.phone || '',
  }

  // Fetch all users for Team Management (admin + supervisor can see the list)
  const { data: allUsers = [] } = await supabase
    .from('user_profiles')
    .select('id, full_name, phone, role, created_at')
    .order('created_at', { ascending: false })

  // Fetch all blocks for Block Configuration tab
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: blocks = [] } = await (supabase.from('blocks') as any)
    .select('id, name, crop_type, variety, area, area_unit, field_capacity, wilting_point, notes')
    .order('name')

  return (
    <div className="max-w-5xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage your account, team, blocks, alerts, sensors, and weather integration.
        </p>
      </div>

      <SettingsForms
        initialProfile={profileData}
        userRole={profile?.role || 'worker'}
        allUsers={allUsers as { id: string; full_name: string | null; phone: string | null; role: 'admin' | 'supervisor' | 'worker'; created_at: string }[]}
        blocks={blocks as { id: string; name: string; crop_type: string; variety: string; area: number; area_unit: string; field_capacity: number | null; wilting_point: number | null; notes: string | null }[]}
      />
    </div>
  )
}
