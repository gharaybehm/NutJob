'use client'

import { LogOut } from 'lucide-react'
import { signOut } from '@/app/actions/auth'
import { useTranslations } from 'next-intl'

export default function SignOutButton({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('auth')

  if (compact) {
    return (
      <button
        onClick={() => signOut()}
        aria-label={t('signOut')}
        className="flex h-8 w-8 items-center justify-center rounded-full text-sidebar-text-muted transition-colors hover:bg-white/5 hover:text-white"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
      </button>
    )
  }

  return (
    <button
      onClick={() => signOut()}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-ink-2 hover:bg-tile hover:text-ink"
    >
      <LogOut className="h-5 w-5 flex-shrink-0 text-ink-3" aria-hidden="true" />
      {t('signOut')}
    </button>
  )
}
