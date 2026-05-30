import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from './utils/supabase/middleware'
import { routing, LOCALE_COOKIE, type Locale } from '@/i18n/routing'

export async function proxy(request: NextRequest) {
  // Run Supabase session refresh (may redirect to /login)
  const supabaseResponse = await updateSession(request)

  // If Supabase returned a redirect, honor it immediately
  if (supabaseResponse.status === 307 || supabaseResponse.status === 302) {
    return supabaseResponse
  }

  // Resolve locale from cookie
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value
  const locale: Locale = routing.locales.includes(cookieLocale as Locale)
    ? (cookieLocale as Locale)
    : routing.defaultLocale

  // Inject locale header so next-intl server helpers can read it
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-next-intl-locale', locale)

  const response = NextResponse.next({ request: { headers: requestHeaders } })

  // Forward all Supabase cookies to the response
  supabaseResponse.cookies.getAll().forEach(({ name, value, ...options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
  })

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.png|logo-full.png|farm-bg.png|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
