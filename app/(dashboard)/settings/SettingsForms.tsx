'use client'

import { useState } from 'react'
import { updateProfile, updatePassword } from './actions'
import { User, LockKeyhole, Mail, Phone, Loader2 } from 'lucide-react'

export default function SettingsForms({ initialProfile }: { initialProfile: any }) {
  const [profileStatus, setProfileStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [isProfilePending, setIsProfilePending] = useState(false)
  const [isPasswordPending, setIsPasswordPending] = useState(false)

  async function onProfileSubmit(formData: FormData) {
    setIsProfilePending(true)
    setProfileStatus(null)
    try {
      const res = await updateProfile(formData)
      if (res.error) setProfileStatus({ type: 'error', message: res.error })
      else if (res.success) setProfileStatus({ type: 'success', message: res.success })
    } catch (e) {
      setProfileStatus({ type: 'error', message: 'Something went wrong' })
    }
    setIsProfilePending(false)
  }

  async function onPasswordSubmit(formData: FormData) {
    setIsPasswordPending(true)
    setPasswordStatus(null)
    try {
      const res = await updatePassword(formData)
      if (res.error) setPasswordStatus({ type: 'error', message: res.error })
      else if (res.success) {
        setPasswordStatus({ type: 'success', message: res.success })
        // Reset form
        const form = document.getElementById('password-form') as HTMLFormElement
        if (form) form.reset()
      }
    } catch (e) {
      setPasswordStatus({ type: 'error', message: 'Something went wrong' })
    }
    setIsPasswordPending(false)
  }

  return (
    <div className="space-y-10">
      {/* Profile Section */}
      <section className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <User className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            Profile Information
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Update your personal details.
          </p>
        </div>

        <form action={onProfileSubmit} className="space-y-6 max-w-xl">
          {profileStatus && (
            <div className={`p-4 rounded-xl text-sm border flex items-center gap-3 ${
              profileStatus.type === 'success' ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:border-green-800/50 dark:text-green-400' : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:border-red-800/50 dark:text-red-400'
            }`}>
              <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${profileStatus.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
              {profileStatus.message}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-200">
              Email address
            </label>
            <div className="relative mt-2">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Mail className="h-5 w-5 text-slate-400" aria-hidden="true" />
              </div>
              <input
                id="email"
                type="email"
                disabled
                value={initialProfile.email}
                className="block w-full rounded-xl border-0 py-2.5 pl-10 pr-3 text-slate-500 bg-slate-50 ring-1 ring-inset ring-slate-200 sm:text-sm sm:leading-6 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700 cursor-not-allowed"
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-500">Email cannot be changed.</p>
          </div>

          <div>
            <label htmlFor="full_name" className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-200">
              Full Name
            </label>
            <div className="mt-2">
              <input
                id="full_name"
                name="full_name"
                type="text"
                defaultValue={initialProfile.full_name}
                className="block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-600 sm:text-sm sm:leading-6 dark:bg-slate-800 dark:text-white dark:ring-slate-700 dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-200">
              Phone Number
            </label>
            <div className="relative mt-2">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Phone className="h-5 w-5 text-slate-400" aria-hidden="true" />
              </div>
              <input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={initialProfile.phone}
                className="block w-full rounded-xl border-0 py-2.5 pl-10 pr-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-600 sm:text-sm sm:leading-6 dark:bg-slate-800 dark:text-white dark:ring-slate-700 dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isProfilePending}
              className="flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-70 disabled:cursor-not-allowed transition-all"
            >
              {isProfilePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Profile Changes
            </button>
          </div>
        </form>
      </section>

      {/* Password Section */}
      <section className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <LockKeyhole className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            Security
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Update your password.
          </p>
        </div>

        <form id="password-form" action={onPasswordSubmit} className="space-y-6 max-w-xl">
          {passwordStatus && (
            <div className={`p-4 rounded-xl text-sm border flex items-center gap-3 ${
              passwordStatus.type === 'success' ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:border-green-800/50 dark:text-green-400' : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:border-red-800/50 dark:text-red-400'
            }`}>
              <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${passwordStatus.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
              {passwordStatus.message}
            </div>
          )}

          <div>
            <label htmlFor="password" className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-200">
              New Password
            </label>
            <div className="mt-2">
              <input
                id="password"
                name="password"
                type="password"
                required
                className="block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-brand-600 sm:text-sm sm:leading-6 dark:bg-slate-800 dark:text-white dark:ring-slate-700"
              />
            </div>
          </div>

          <div>
            <label htmlFor="confirm_password" className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-200">
              Confirm New Password
            </label>
            <div className="mt-2">
              <input
                id="confirm_password"
                name="confirm_password"
                type="password"
                required
                className="block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-brand-600 sm:text-sm sm:leading-6 dark:bg-slate-800 dark:text-white dark:ring-slate-700"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isPasswordPending}
              className="flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-70 disabled:cursor-not-allowed transition-all"
            >
              {isPasswordPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Password
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
