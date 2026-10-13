'use client'

import { LogOut } from 'lucide-react'
import { signOut } from '@/app/actions/auth'
import { useTranslations } from 'next-intl'

/**
 * The service worker keeps the last-loaded farm pages so they open with no
 * signal. They hold the signed-in person's farm data, so they are removed on
 * sign-out: the next person on a shared phone must not be shown them.
 */
async function signOutAndForget() {
  try {
    const names = await caches.keys()
    await Promise.all(names.filter((n) => n.startsWith('nutjob-pages')).map((n) => caches.delete(n)))
  } catch {
    // No Cache Storage (older browser, private window): nothing was kept.
  }
  await signOut()
}

export default function SignOutButton({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('auth')

  if (compact) {
    return (
      <button
        onClick={() => void signOutAndForget()}
        aria-label={t('signOut')}
        className="flex h-8 w-8 items-center justify-center rounded-full text-sidebar-text-muted transition-colors hover:bg-white/5 hover:text-white"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
      </button>
    )
  }

  return (
    <button
      onClick={() => void signOutAndForget()}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-ink-2 hover:bg-tile hover:text-ink"
    >
      <LogOut className="h-5 w-5 flex-shrink-0 text-ink-3" aria-hidden="true" />
      {t('signOut')}
    </button>
  )
}
