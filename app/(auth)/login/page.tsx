import Image from 'next/image'
import { LockKeyhole, Mail } from 'lucide-react'
import { login } from './actions'
import { getTranslations } from 'next-intl/server'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const resolvedSearchParams = await searchParams
  const message = resolvedSearchParams?.message as string | undefined
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
          className="absolute inset-0 object-cover opacity-40 mix-blend-overlay"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/90 via-emerald-900/50 to-transparent mix-blend-multiply" />

        <div className="relative z-10">
          <div
            className="absolute -inset-12 rounded-full"
            style={{ background: "radial-gradient(ellipse at center, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.25) 45%, transparent 72%)" }}
          />
          <Image src="/logo-full.png" alt={t('logoAlt')} width={180} height={254} className="relative object-contain" />
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

      {/* Right side - Login Form */}
      <div className="flex w-full flex-col overflow-y-auto px-4 py-12 sm:px-6 lg:w-1/2 lg:px-20 lg:justify-center xl:px-32 relative bg-zinc-50">
        <div className="mx-auto w-full max-w-sm lg:max-w-md">
          <div className="mb-10 flex items-center justify-center lg:hidden">
            <Image src="/logo-full.png" alt={t('logoAlt')} width={130} height={183} className="object-contain" />
          </div>

          <div className="mb-10">
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-900">{t('title')}</h2>
            <p className="mt-2 text-sm text-zinc-500">{t('subtitle')}</p>
          </div>

          <div className="mt-8 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-200/50">
            <form action={login} className="space-y-6">
              {message && (
                <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600 border border-red-100 flex items-center gap-3">
                  <div className="h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  {message}
                </div>
              )}

              <div className="space-y-4">
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
              </div>

              <div className="flex items-center justify-between mt-6">
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

              <div>
                <button
                  type="submit"
                  className="group relative flex w-full justify-center rounded-xl bg-emerald-600 px-3 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 hover:shadow-md hover:shadow-emerald-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 transition-all duration-200"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {t('signIn')}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
