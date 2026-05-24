import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from './types'

export async function createClient(rememberMe?: boolean) {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              const adjustedOptions = { ...options };
              if (rememberMe === false) {
                // Strip maxAge and expires to make it a session cookie (deleted on browser close)
                delete adjustedOptions.maxAge;
                delete adjustedOptions.expires;
              } else if (rememberMe === true) {
                // Ensure a long-term TTL, e.g., 30 days
                adjustedOptions.maxAge = 60 * 60 * 24 * 30; // 30 days
              }
              cookieStore.set(name, value, adjustedOptions)
            })
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
