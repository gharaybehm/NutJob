'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function updateProfile(formData: FormData) {
  const supabase = await createClient()

  const data = {
    full_name: formData.get('full_name') as string,
    phone: formData.get('phone') as string,
  }

  const { error } = await supabase.auth.updateUser({
    data: data,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/settings')
  revalidatePath('/', 'layout')
  return { success: 'Profile updated successfully' }
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient()

  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirm_password') as string

  if (password !== confirmPassword) {
    return { error: 'Passwords do not match' }
  }

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters' }
  }

  const { error } = await supabase.auth.updateUser({
    password: password,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: 'Password updated successfully' }
}

export async function updateUserRole(userId: string, role: 'admin' | 'supervisor' | 'worker') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Check if current user is an admin
  const { data: curProfile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (curProfile?.role !== 'admin') {
    return { error: 'Only admins can change user roles' }
  }

  const adminClient = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (adminClient.from('user_profiles') as any)
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/settings')
  return { success: 'User role updated successfully' }
}

export async function createWorker(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Check if current user is admin or supervisor
  const { data: curProfile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (curProfile?.role !== 'admin' && curProfile?.role !== 'supervisor') {
    return { error: 'Only admins and supervisors can create new workers' }
  }

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('full_name') as string
  const role = formData.get('role') as 'supervisor' | 'worker'

  if (!email || !password || !fullName || !role) {
    return { error: 'All fields are required' }
  }

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters' }
  }

  const adminClient = createAdminClient()

  // 1. Create auth user in Supabase Auth
  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName }
  })

  if (createError || !newUser.user) {
    return { error: createError?.message || 'Failed to create auth user' }
  }

  // 2. Insert into user_profiles
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: profileError } = await (adminClient.from('user_profiles') as any)
    .insert({
      id: newUser.user.id,
      full_name: fullName,
      role: role,
    })

  if (profileError) {
    // Attempt rollback of auth user
    await adminClient.auth.admin.deleteUser(newUser.user.id)
    return { error: profileError.message }
  }

  revalidatePath('/settings')
  return { success: `Successfully created new ${role}` }
}

export async function updateBlockConfig(
  blockId: string,
  params: {
    fieldCapacity: number | null;
    wiltingPoint: number | null;
    notes: string | null;
  }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: curProfile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (curProfile?.role !== 'admin' && curProfile?.role !== 'supervisor') {
    return { error: 'Only admins and supervisors can edit block configuration' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('blocks') as any)
    .update({
      field_capacity: params.fieldCapacity,
      wilting_point: params.wiltingPoint,
      notes: params.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', blockId)

  if (error) return { error: error.message }

  revalidatePath('/blocks')
  revalidatePath('/settings')
  return { success: 'Block configuration saved' }
}
