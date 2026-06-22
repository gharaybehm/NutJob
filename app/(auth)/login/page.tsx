import Image from 'next/image'
import { LockKeyhole, Mail, User } from 'lucide-react'
import { login, signUp, signInWithGoogle } from './actions'
import { getTranslations } from 'next-intl/server'

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
    <div className="flex h-full overflow-hidden bg-white">
      {/* Left side - Image & Branding */}
      <div className="relative hidden w-1/2 lg:flex lg:flex-col lg:justify-between p-12 overflow-hidden bg-emerald-900">
        <Image
          src="/farm-bg.png"
          alt={t('orchardAlt')}
          fill
          priority
          className="absolute inset-0 object-cover mix-blend-overlay"
          style={{
            maskImage: 'linear-gradient(to bottom right, rgba(0,0,0,0.50) 0%, rgba(0,0,0,0.05) 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom right, rgba(0,0,0,0.50) 0%, rgba(0,0,0,0.05) 100%)',
          }}
        />

        <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/90 via-emerald-900/50 to-transparent mix-blend-multiply" />

        <div className="relative z-10">
          <div
            className="absolute -inset-12 rounded-full"
            style={{ background: "radial-gradient(ellipse at center, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.25) 45%, transparent 72%)" }}
          />
          <Image src="/logo-full.png" alt={t('logoAlt')} width={196} height={150} className="relative object-contain" unoptimized />
        </div>

        <div className="relative z-10 max-w-lg pb-12">
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-5xl leading-tight">
            {t('tagline')}
          </h1>
          <p className="mt-6 text-lg text-emerald-100/80 leading-relaxed font-light">
            {t('taglineSubtitle')}
          </p>
        </div>
      </div>

      {/* Right side - Form Panel */}
      <div className="flex w-full flex-col overflow-y-auto px-4 py-12 sm:px-6 lg:w-1/2 lg:px-20 lg:justify-center xl:px-32 relative bg-zinc-50">
        <div className="mx-auto w-full max-w-sm lg:max-w-md">
          <div className="mb-10 flex items-center justify-center lg:hidden">
            <Image src="/logo-full.png" alt={t('logoAlt')} width={126} height={97} className="object-contain" unoptimized />
          </div>

          <div className="mb-6">
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-900">
              {mode === 'signup' ? t('signUpTitle') : t('title')}
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              {mode === 'signup' ? t('signUpSubtitle') : t('subtitle')}
            </p>
          </div>

          <div className="mt-6 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-200/50">
            {/* Google OAuth Button */}
            <form action={signInWithGoogle}>
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-3 py-3 text-sm font-medium text-zinc-700 shadow-sm ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 hover:shadow-md transition-all duration-200 cursor-pointer"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
                </svg>
                <span>{t('googleButton')}</span>
              </button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-zinc-200" />
              </div>
              <div className="relative flex justify-center text-sm leading-6">
                <span className="bg-white px-4 text-zinc-400 font-light">
                  {mode === 'signup' ? 'or register with email' : 'or continue with email'}
                </span>
              </div>
            </div>

            {/* Email / Password Form */}
            <form action={mode === 'signup' ? signUp : login} className="space-y-4">
              {message && (
                <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 border border-emerald-100 flex items-center gap-3">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-600 flex-shrink-0" />
                  {message}
                </div>
              )}

              {mode === 'signup' && (
                <div>
                  <label htmlFor="full_name" className="block text-sm font-medium leading-6 text-zinc-900">
                    {t('fullNameLabel')}
                  </label>
                  <div className="relative mt-2">
                    <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3">
                      <User className="h-5 w-5 text-zinc-400" aria-hidden="true" />
                    </div>
                    <input
                      id="full_name" name="full_name" type="text" required
                      className="block w-full rounded-xl border-0 py-3 ps-10 pe-3 text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-300 placeholder:text-zinc-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6 transition-all duration-200"
                      placeholder={t('fullNamePlaceholder')}
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium leading-6 text-zinc-900">
                  {t('emailLabel')}
                </label>
                <div className="relative mt-2">
                  <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3">
                    <Mail className="h-5 w-5 text-zinc-400" aria-hidden="true" />
                  </div>
                  <input
                    id="email" name="email" type="email" autoComplete="email" required
                    className="block w-full rounded-xl border-0 py-3 ps-10 pe-3 text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-300 placeholder:text-zinc-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6 transition-all duration-200"
                    placeholder={t('emailPlaceholder')}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium leading-6 text-zinc-900">
                  {t('passwordLabel')}
                </label>
                <div className="relative mt-2">
                  <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3">
                    <LockKeyhole className="h-5 w-5 text-zinc-400" aria-hidden="true" />
                  </div>
                  <input
                    id="password" name="password" type="password" autoComplete="current-password" required
                    className="block w-full rounded-xl border-0 py-3 ps-10 pe-3 text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-300 placeholder:text-zinc-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6 transition-all duration-200"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {mode === 'signin' && (
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <input
                      id="remember-me" name="remember-me" type="checkbox"
                      className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer"
                    />
                    <label htmlFor="remember-me" className="block text-sm leading-6 text-zinc-700 cursor-pointer">
                      {t('rememberMe')}
                    </label>
                  </div>
                  <div className="text-sm leading-6">
                    <a href="#" className="font-medium text-emerald-600 hover:text-emerald-500 transition-colors">
                      {t('forgotPassword')}
                    </a>
                  </div>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  className="group relative flex w-full justify-center rounded-xl bg-emerald-600 px-3 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 hover:shadow-md hover:shadow-emerald-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 transition-all duration-200 cursor-pointer"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {mode === 'signup' ? t('signUpButton') : t('signIn')}
                  </span>
                </button>
              </div>
            </form>

            <div className="mt-6 text-center text-sm">
              {mode === 'signup' ? (
                <a href="/login?mode=signin" className="font-medium text-emerald-600 hover:text-emerald-500 transition-colors">
                  {t('hasAccountLink')}
                </a>
              ) : (
                <a href="/login?mode=signup" className="font-medium text-emerald-600 hover:text-emerald-500 transition-colors">
                  {t('noAccountLink')}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
