import Image from 'next/image'
import { LockKeyhole, Mail, User, ArrowRight } from 'lucide-react'
import { login, signUp, signInWithGoogle } from './actions'
import { getTranslations } from 'next-intl/server'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  )
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const resolvedSearchParams = await searchParams
  const message = resolvedSearchParams?.message as string | undefined
  const mode = (resolvedSearchParams?.mode as string) === 'signup' ? 'signup' : 'signin'
  const t = await getTranslations('auth.login')

  return (
    <div className="flex h-full overflow-hidden bg-paper-2">
      {/* Left side - Branding */}
      <div className="relative hidden w-1/2 lg:flex lg:flex-col lg:justify-between p-12 overflow-hidden bg-gradient-to-b from-sidebar-from to-sidebar-to">
        <div
          className="pointer-events-none absolute -top-10 -right-10 h-56 w-56 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(231,190,86,.18), rgba(231,190,86,0) 70%)' }}
        />

        <div className="relative z-10">
          <Image src="/logo-dark-transparent.png" alt={t('logoAlt')} width={880} height={280} className="h-[208px] w-auto object-contain mix-blend-screen brightness-125" unoptimized />
        </div>

        <div className="relative z-10 max-w-lg">
          <h1 className="font-heading text-[38px] font-bold leading-[1.14] tracking-tight text-white">
            {t('tagline')}
          </h1>
          <p className="mt-4 max-w-[330px] text-[15px] leading-relaxed text-[#A9B8AC]">
            {t('taglineSubtitle')}
          </p>
          <div className="mt-7 flex gap-2.5">
            <span className="h-[9px] w-[9px] rounded-full bg-[#8FE0A8]" />
            <span className="h-[9px] w-[9px] rounded-full bg-gold-bright" />
            <span className="h-[9px] w-[9px] rounded-full bg-blue" />
          </div>
        </div>

        <div className="relative z-10 font-mono text-[10px] tracking-wide text-sidebar-text-muted">
          © 2026 ROOTLOOT.AI
        </div>
      </div>

      {/* Right side - Form Panel */}
      <div className="flex w-full flex-col overflow-y-auto px-4 py-12 sm:px-6 lg:w-1/2 lg:px-20 lg:justify-center xl:px-32 relative bg-paper-2">
        <div className="mx-auto w-full max-w-sm lg:max-w-md">
          <div className="mb-10 flex items-center justify-center lg:hidden">
            <Image src="/logo-dark-transparent.png" alt={t('logoAlt')} width={164} height={126} className="object-contain" unoptimized />
          </div>

          <h2 className="font-heading text-[26px] font-bold tracking-tight text-ink">
            {mode === 'signup' ? t('signUpTitle') : t('title')}
          </h2>
          <p className="mt-1.5 text-[13.5px] text-ink-2">
            {mode === 'signup' ? t('signUpSubtitle') : t('subtitle')}
          </p>

          <form action={mode === 'signup' ? signUp : login} className="mt-7 space-y-4">
            {message && (
              <div className="rounded-xl border border-green/20 bg-green-soft p-4 text-sm text-green flex items-center gap-3">
                <div className="h-1.5 w-1.5 rounded-full bg-green flex-shrink-0" />
                {message}
              </div>
            )}

            {mode === 'signup' && (
              <div>
                <label htmlFor="full_name" className="mb-1.5 block font-mono text-[10px] tracking-wide text-ink-3">
                  {t('fullNameLabel').toUpperCase()}
                </label>
                <div className="flex items-center gap-2.5 rounded-[11px] border border-line bg-surface px-3.5 py-3">
                  <User className="h-[19px] w-[19px] text-ink-3" aria-hidden="true" />
                  <input
                    id="full_name" name="full_name" type="text" required
                    className="w-full bg-transparent text-sm text-ink placeholder:text-ink-4 focus:outline-none"
                    placeholder={t('fullNamePlaceholder')}
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-1.5 block font-mono text-[10px] tracking-wide text-ink-3">
                {t('emailLabel').toUpperCase()}
              </label>
              <div className="flex items-center gap-2.5 rounded-[11px] border border-line bg-surface px-3.5 py-3">
                <Mail className="h-[19px] w-[19px] text-ink-3" aria-hidden="true" />
                <input
                  id="email" name="email" type="email" autoComplete="email" required
                  className="w-full bg-transparent text-sm text-ink placeholder:text-ink-4 focus:outline-none"
                  placeholder={t('emailPlaceholder')}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block font-mono text-[10px] tracking-wide text-ink-3">
                {t('passwordLabel').toUpperCase()}
              </label>
              <div className="flex items-center gap-2.5 rounded-[11px] border border-line bg-surface px-3.5 py-3">
                <LockKeyhole className="h-[19px] w-[19px] text-ink-3" aria-hidden="true" />
                <input
                  id="password" name="password" type="password" autoComplete="current-password" required
                  className="w-full bg-transparent text-sm text-ink placeholder:text-ink-4 focus:outline-none"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {mode === 'signin' && (
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <input
                    id="remember-me" name="remember-me" type="checkbox"
                    className="h-[19px] w-[19px] rounded-[6px] border-line text-green focus:ring-green cursor-pointer"
                  />
                  <label htmlFor="remember-me" className="text-[13px] text-ink cursor-pointer">
                    {t('rememberMe')}
                  </label>
                </div>
                <a href="#" className="text-[13px] font-semibold text-green hover:text-[#37905C] transition-colors">
                  {t('forgotPassword')}
                </a>
              </div>
            )}

            <button
              type="submit"
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#37905C] to-green px-3 py-3.5 text-[14.5px] font-semibold text-white shadow-[0_8px_18px_-5px_rgba(47,125,79,.55)] transition hover:brightness-105"
            >
              {mode === 'signup' ? t('signUpButton') : t('signIn')}
              <ArrowRight className="h-[19px] w-[19px]" />
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-line" />
            <span className="font-mono text-[10px] text-ink-4">OR</span>
            <div className="h-px flex-1 bg-line" />
          </div>

          <form action={signInWithGoogle}>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-3.5 text-[13.5px] font-semibold text-ink transition hover:border-ink-4"
            >
              <GoogleIcon />
              {t('googleButton')}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            {mode === 'signup' ? (
              <a href="/login?mode=signin" className="font-semibold text-green hover:text-[#37905C] transition-colors">
                {t('hasAccountLink')}
              </a>
            ) : (
              <a href="/login?mode=signup" className="font-semibold text-green hover:text-[#37905C] transition-colors">
                {t('noAccountLink')}
              </a>
            )}
          </div>

          <div className="mt-6 text-center font-mono text-[10px] tracking-wide text-ink-4">
            ROLE-BASED ACCESS · ADMIN · SUPERVISOR · WORKER
          </div>
        </div>
      </div>
    </div>
  )
}
