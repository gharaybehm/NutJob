'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { routing, LOCALE_COOKIE, type Locale } from '@/i18n/routing'
import type { SensorFormValues, Sensor } from '@/types/sensors'
import { createSensecapClient } from '@/utils/sensecap-client'
import { sendInviteEmail } from '@/utils/email'

export async function setLocale(locale: string) {
  if (!routing.locales.includes(locale as Locale)) {
    return { error: 'Invalid locale' }
  }

  const cookieStore = await cookies()
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: false,
  })

  revalidatePath('/', 'layout')
  return { success: true }
}

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

export async function updateUserRole(farmId: string, userId: string, role: 'admin' | 'supervisor' | 'worker') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Check if current user is an admin on this farm (per-farm role is authoritative)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: curMembership } = await (supabase as any)
    .from('farm_members')
    .select('role')
    .eq('farm_id', farmId)
    .eq('user_id', user.id)
    .single()

  if (curMembership?.role !== 'admin') {
    return { error: 'Only admins can change user roles' }
  }

  const adminClient = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (adminClient as any).from('farm_members')
    .update({ role })
    .eq('farm_id', farmId)
    .eq('user_id', userId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/${farmId}/settings`)
  return { success: 'User role updated successfully' }
}

export async function removeMember(farmId: string, userId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  if (userId === user.id) {
    return { error: 'You cannot remove yourself from the farm' }
  }

  // Check if current user is an admin on this farm (per-farm role is authoritative)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: curMembership } = await (supabase as any)
    .from('farm_members')
    .select('role')
    .eq('farm_id', farmId)
    .eq('user_id', user.id)
    .single()

  if (curMembership?.role !== 'admin') {
    return { error: 'Only admins can remove team members' }
  }

  const adminClient = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: targetMembership } = await (adminClient as any)
    .from('farm_members')
    .select('role')
    .eq('farm_id', farmId)
    .eq('user_id', userId)
    .single()

  if (targetMembership?.role === 'admin') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (adminClient as any)
      .from('farm_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('farm_id', farmId)
      .eq('role', 'admin')

    if ((count ?? 0) <= 1) {
      return { error: 'Cannot remove the only admin of this farm' }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (adminClient as any).from('farm_members')
    .delete()
    .eq('farm_id', farmId)
    .eq('user_id', userId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/${farmId}/settings`)
  return { success: 'Member removed from this farm' }
}

// Supabase's admin listUsers() has no email filter, so finding an existing
// auth user by email means paginating and matching client-side.
async function findAuthUserByEmail(
  adminClient: ReturnType<typeof createAdminClient>,
  email: string
): Promise<{ id: string; email: string } | null> {
  const PER_PAGE = 1000
  const MAX_PAGES = 20
  const target = email.trim().toLowerCase()

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error) throw new Error(`Failed to look up existing users: ${error.message}`)

    const match = data.users.find(u => u.email?.toLowerCase() === target)
    if (match) return { id: match.id, email: match.email! }
    if (data.users.length < PER_PAGE) return null
  }

  throw new Error('Too many users to search — user lookup limit exceeded')
}

export async function createWorker(farmId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Check if current user is admin or supervisor on this farm (per-farm role is authoritative)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: curMembership } = await (supabase as any)
    .from('farm_members')
    .select('role')
    .eq('farm_id', farmId)
    .eq('user_id', user.id)
    .single()

  if (curMembership?.role !== 'admin' && curMembership?.role !== 'supervisor') {
    return { error: 'Only admins and supervisors can create new workers' }
  }

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('full_name') as string
  const role = formData.get('role') as 'supervisor' | 'worker'

  if (!email || !fullName || !role) {
    return { error: 'All fields are required' }
  }

  const adminClient = createAdminClient()

  let existingUserId: string | null = null
  try {
    const existing = await findAuthUserByEmail(adminClient, email)
    existingUserId = existing?.id ?? null
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to look up existing users' }
  }

  // Existing account: just scope them to this farm, don't touch their global profile
  if (existingUserId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingMembership } = await (adminClient as any)
      .from('farm_members')
      .select('user_id')
      .eq('farm_id', farmId)
      .eq('user_id', existingUserId)
      .maybeSingle()

    if (existingMembership) {
      return { error: 'This user is already a team member of this farm.' }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: memberError } = await (adminClient as any).from('farm_members')
      .insert({
        farm_id: farmId,
        user_id: existingUserId,
        role: role,
      })

    if (memberError) {
      return { error: memberError.message }
    }

    revalidatePath(`/${farmId}/settings`)
    return { success: `Added existing user to this farm as ${role}`, isNewUser: false }
  }

  if (!password || password.length < 6) {
    return { error: 'Password must be at least 6 characters' }
  }

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

  // 3. Scope the new user to this farm — without this row they'd never appear
  // in this farm's Team tab or be able to access it at all
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: memberError } = await (adminClient as any).from('farm_members')
    .insert({
      farm_id: farmId,
      user_id: newUser.user.id,
      role: role,
    })

  if (memberError) {
    // Attempt rollback of auth user + profile
    await adminClient.auth.admin.deleteUser(newUser.user.id)
    return { error: memberError.message }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: farm } = await (adminClient as any)
    .from('farms')
    .select('name')
    .eq('id', farmId)
    .single()

  let emailWarning: string | undefined
  try {
    await sendInviteEmail(email, {
      farmName: farm?.name || 'your farm',
      email,
      password,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    })
  } catch (err) {
    emailWarning = `Account created, but the invite email failed to send: ${err instanceof Error ? err.message : 'unknown error'}. Use "Copy invite message" to share the login details instead.`
  }

  revalidatePath(`/${farmId}/settings`)
  return { success: `Successfully created new ${role}`, isNewUser: true, warning: emailWarning }
}

// ─── Sensor actions ───────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, error: 'Not authenticated' as const }
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { user: null, error: 'Only admins can manage sensors' as const }
  return { user, error: null }
}

export async function registerSensor(
  farmId: string,
  values: SensorFormValues
): Promise<{ error?: string; sensor?: Sensor }> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const apiKey = crypto.randomUUID()
  const adminClient = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (adminClient as any).from('sensors')
    .insert({
      farm_id: farmId,
      block_id: values.block_id ?? null,
      name: values.name,
      device_id: values.device_id,
      sensor_type: values.sensor_type,
      api_key: apiKey,
      location_notes: values.location_notes ?? null,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath(`/${farmId}/settings`)
  return { sensor: data as Sensor }
}

export async function updateSensor(
  sensorId: string,
  farmId: string,
  values: Partial<SensorFormValues>
): Promise<{ error?: string }> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const adminClient = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (adminClient as any).from('sensors')
    .update({
      name: values.name,
      device_id: values.device_id,
      sensor_type: values.sensor_type,
      block_id: values.block_id ?? null,
      location_notes: values.location_notes ?? null,
    })
    .eq('id', sensorId)
    .eq('farm_id', farmId)

  if (error) return { error: error.message }
  revalidatePath(`/${farmId}/settings`)
  return {}
}

export async function deleteSensor(
  sensorId: string,
  farmId: string
): Promise<{ error?: string }> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const adminClient = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (adminClient as any).from('sensors')
    .delete()
    .eq('id', sensorId)
    .eq('farm_id', farmId)

  if (error) return { error: error.message }
  revalidatePath(`/${farmId}/settings`)
  return {}
}

export async function assignSensorToBlock(
  sensorId: string,
  blockId: string | null,
  farmId: string
): Promise<{ error?: string }> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const adminClient = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (adminClient as any).from('sensors')
    .update({ block_id: blockId })
    .eq('id', sensorId)
    .eq('farm_id', farmId)

  if (error) return { error: error.message }
  revalidatePath(`/${farmId}/settings`)
  return {}
}

export async function generateSensorApiKey(
  sensorId: string,
  farmId: string
): Promise<{ error?: string; api_key?: string }> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const newKey = crypto.randomUUID()
  const adminClient = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (adminClient as any).from('sensors')
    .update({ api_key: newKey })
    .eq('id', sensorId)
    .eq('farm_id', farmId)

  if (error) return { error: error.message }
  revalidatePath(`/${farmId}/settings`)
  return { api_key: newKey }
}

// ─── Block config ─────────────────────────────────────────────────────────────

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

// ─── SenseCAP integration ─────────────────────────────────────────────────────

export async function saveSensecapCredentials(
  farmId: string,
  apiId: string,
  accessKey: string
): Promise<{ error?: string }> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }
  const adminClient = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (adminClient as any).from('farms')
    .update({ sensecap_api_id: apiId, sensecap_access_key: accessKey })
    .eq('id', farmId)
  if (error) return { error: error.message }
  revalidatePath(`/${farmId}/settings`)
  return {}
}

export async function testSensecapConnection(
  apiId: string,
  accessKey: string
): Promise<{ org_id?: string; error?: string }> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }
  try {
    const client = createSensecapClient(apiId, accessKey)
    const orgId = await client.verifyConnection()
    return { org_id: orgId }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Connection failed' }
  }
}
