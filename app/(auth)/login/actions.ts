'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function login(formData: FormData) {
  const rememberMe = formData.get('remember-me') === 'on'
  const supabase = await createClient(rememberMe)

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const { error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/', 'layout')
  redirect('/farms')
}

export async function signUp(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('full_name') as string
  const rememberMe = formData.get('remember-me') === 'on'

  const supabase = await createClient(rememberMe)

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
      emailRedirectTo: `${(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '')}/auth/callback`,
    }
  })

  if (error) {
    redirect(`/login?mode=signup&message=${encodeURIComponent(error.message)}`)
  }

  // Create the user profile in public.user_profiles with 'admin' role
  if (data.user) {
    const adminClient = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: profileError } = await (adminClient.from('user_profiles') as any).insert({
      id: data.user.id,
      full_name: fullName || email.split('@')[0],
      role: 'admin',
      updated_at: new Date().toISOString()
    })
    
    if (profileError) {
      console.error('Failed to create user profile:', profileError)
    }
  }

  // Check if session is established (if email confirmation is disabled)
  if (data.session) {
    revalidatePath('/', 'layout')
    redirect('/farms')
  } else {
    // If confirmation is required, show verification message
    redirect(`/login?message=${encodeURIComponent('Sign up successful! Please check your email for a confirmation link.')}`)
  }
}

export async function signInWithGoogle() {
  const supabase = await createClient()
  const redirectTo = `${(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '')}/auth/callback`
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
    },
  })

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message)}`)
  }

  if (data.url) {
    redirect(data.url)
  }
}
