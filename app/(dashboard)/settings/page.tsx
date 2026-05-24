import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import SettingsForms from './SettingsForms'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "worker") {
    redirect("/dashboard?error=Unauthorized");
  }

  const profileData = {
    email: user.email || '',
    full_name: user.user_metadata?.full_name || '',
    phone: user.user_metadata?.phone || '',
  }

  // If user is an admin, fetch all registered user profiles for Team Management
  let allUsers: {
    id: string;
    full_name: string | null;
    phone: string | null;
    role: 'admin' | 'supervisor' | 'worker';
    created_at: string;
  }[] = [];
  if (profile?.role === "admin") {
    const { data } = await supabase
      .from("user_profiles")
      .select("*")
      .order("created_at", { ascending: false });
    allUsers = data || [];
  }

  return (
    <div className="max-w-4xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage your account settings and preferences.
        </p>
      </div>

      <SettingsForms 
        initialProfile={profileData} 
        userRole={profile?.role || 'worker'} 
        allUsers={allUsers}
      />
    </div>
  )
}
