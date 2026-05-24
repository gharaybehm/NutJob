'use client'

import { useState } from 'react'
import { updateProfile, updatePassword, updateUserRole, createWorker } from './actions'
import { User, LockKeyhole, Mail, Phone, Loader2, Users, UserPlus, ShieldCheck } from 'lucide-react'

interface SettingsFormsProps {
  initialProfile: {
    email: string
    full_name: string
    phone: string
  }
  userRole: 'admin' | 'supervisor' | 'worker'
  allUsers?: {
    id: string
    full_name: string | null
    phone: string | null
    role: 'admin' | 'supervisor' | 'worker'
    created_at: string
  }[]
}

export default function SettingsForms({ 
  initialProfile, 
  userRole = 'worker',
  allUsers = []
}: SettingsFormsProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'team'>('profile')
  
  // Status states
  const [profileStatus, setProfileStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [teamStatus, setTeamStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [roleUpdateStatus, setRoleUpdateStatus] = useState<Record<string, { type: 'success' | 'error', message: string }>>({})

  // Pending states
  const [isProfilePending, setIsProfilePending] = useState(false)
  const [isPasswordPending, setIsPasswordPending] = useState(false)
  const [isTeamPending, setIsTeamPending] = useState(false)
  const [isRolePending, setIsRolePending] = useState<Record<string, boolean>>({})

  // Tab changing logic
  const showTeamTab = userRole === 'admin' || userRole === 'supervisor'

  async function onProfileSubmit(formData: FormData) {
    setIsProfilePending(true)
    setProfileStatus(null)
    try {
      const res = await updateProfile(formData)
      if (res.error) setProfileStatus({ type: 'error', message: res.error })
      else if (res.success) setProfileStatus({ type: 'success', message: res.success })
    } catch {
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
        const form = document.getElementById('password-form') as HTMLFormElement
        if (form) form.reset()
      }
    } catch {
      setPasswordStatus({ type: 'error', message: 'Something went wrong' })
    }
    setIsPasswordPending(false)
  }

  async function handleRoleChange(userId: string, newRole: 'admin' | 'supervisor' | 'worker') {
    setIsRolePending(prev => ({ ...prev, [userId]: true }))
    setRoleUpdateStatus(prev => {
      const next = { ...prev }
      delete next[userId]
      return next
    })
    try {
      const res = await updateUserRole(userId, newRole)
      if (res.error) {
        setRoleUpdateStatus(prev => ({ ...prev, [userId]: { type: 'error', message: res.error } }))
      } else if (res.success) {
        setRoleUpdateStatus(prev => ({ ...prev, [userId]: { type: 'success', message: res.success } }))
      }
    } catch {
      setRoleUpdateStatus(prev => ({ ...prev, [userId]: { type: 'error', message: 'Failed to update' } }))
    }
    setIsRolePending(prev => ({ ...prev, [userId]: false }))
  }

  async function onNewWorkerSubmit(formData: FormData) {
    setIsTeamPending(true)
    setTeamStatus(null)
    try {
      const res = await createWorker(formData)
      if (res.error) {
        setTeamStatus({ type: 'error', message: res.error })
      } else if (res.success) {
        setTeamStatus({ type: 'success', message: res.success })
        const form = document.getElementById('new-worker-form') as HTMLFormElement
        if (form) form.reset()
      }
    } catch {
      setTeamStatus({ type: 'error', message: 'Something went wrong' })
    }
    setIsTeamPending(false)
  }

  return (
    <div className="space-y-6">
      {/* Tabs segment */}
      {showTeamTab && (
        <div className="flex border-b border-slate-200 dark:border-slate-800 pb-px mb-6">
          <button 
            onClick={() => setActiveTab('profile')} 
            className={`border-b-2 px-4 py-3 text-sm font-semibold tracking-tight transition-all -mb-px flex items-center gap-2 ${
              activeTab === 'profile' 
                ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400' 
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            <User className="h-4 w-4" />
            Account & Security
          </button>
          <button 
            onClick={() => setActiveTab('team')} 
            className={`border-b-2 px-4 py-3 text-sm font-semibold tracking-tight transition-all -mb-px flex items-center gap-2 ${
              activeTab === 'team' 
                ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400' 
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            <Users className="h-4 w-4" />
            Team Management
          </button>
        </div>
      )}

      {activeTab === 'profile' ? (
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
      ) : (
        <div className="space-y-10">
          {/* Team Roles Section (Visible to Admins/Supervisors, but management dropdown only to Admin) */}
          <section className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                Team Roles & Access Control
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {userRole === 'admin' 
                  ? 'Manage user access levels. Changes are saved immediately to Supabase and take effect on next refresh.' 
                  : 'View current team access levels (Admins only can modify roles).'}
              </p>
            </div>

            {allUsers.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-sm">No registered team members found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Phone</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Role</th>
                      {userRole === 'admin' && <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {allUsers.map((userItem) => {
                      const isSelf = userItem.full_name === initialProfile.full_name && userItem.phone === initialProfile.phone;
                      
                      return (
                        <tr key={userItem.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-900 dark:text-white">{userItem.full_name || 'Anonymous User'}</span>
                              {isSelf && (
                                <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-950/20 dark:text-brand-400">
                                  You
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                            {userItem.phone || 'No phone'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {userRole === 'admin' && !isSelf ? (
                              <select 
                                defaultValue={userItem.role}
                                onChange={(e) => handleRoleChange(userItem.id, e.target.value as 'admin' | 'supervisor' | 'worker')}
                                disabled={isRolePending[userItem.id]}
                                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                              >
                                <option value="admin">Admin</option>
                                <option value="supervisor">Supervisor</option>
                                <option value="worker">Worker</option>
                              </select>
                            ) : (
                              <span className={`text-xs font-bold tracking-wider uppercase px-2 py-0.5 rounded-md ${
                                userItem.role === 'admin' 
                                  ? 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400' 
                                  : userItem.role === 'supervisor'
                                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400'
                                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400'
                              }`}>
                                {userItem.role}
                              </span>
                            )}
                          </td>
                          {userRole === 'admin' && (
                            <td className="px-4 py-3 whitespace-nowrap text-right text-xs">
                              {roleUpdateStatus[userItem.id] && (
                                <span className={roleUpdateStatus[userItem.id].type === 'success' ? 'text-green-600 font-medium' : 'text-red-500'}>
                                  {roleUpdateStatus[userItem.id].message}
                                </span>
                              )}
                              {isRolePending[userItem.id] && (
                                <Loader2 className="inline h-4 w-4 animate-spin text-brand-600" />
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Add Worker Section (Visible to Admin + Supervisor) */}
          <section className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                Add Team Member
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {userRole === 'admin'
                  ? 'Create credentials for a new Supervisor or Worker immediately. They will be able to log in with these details.'
                  : 'Create credentials for a new worker. They will be able to log in with these details.'}
              </p>
            </div>

            <form id="new-worker-form" action={onNewWorkerSubmit} className="space-y-5 max-w-xl">
              {teamStatus && (
                <div className={`p-4 rounded-xl text-sm border flex items-center gap-3 ${
                  teamStatus.type === 'success' ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:border-green-800/50 dark:text-green-400' : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:border-red-800/50 dark:text-red-400'
                }`}>
                  <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${teamStatus.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                  {teamStatus.message}
                </div>
              )}

              <div>
                <label htmlFor="full_name_new" className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-200">
                  Full Name
                </label>
                <div className="mt-2">
                  <input
                    id="full_name_new"
                    name="full_name"
                    type="text"
                    required
                    placeholder="e.g. Ahmet Yılmaz"
                    className="block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-600 sm:text-sm sm:leading-6 dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email_new" className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-200">
                  Email Address
                </label>
                <div className="mt-2">
                  <input
                    id="email_new"
                    name="email"
                    type="email"
                    required
                    placeholder="worker@farm.com"
                    className="block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-600 sm:text-sm sm:leading-6 dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password_new" className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-200">
                  Temporary Password
                </label>
                <div className="mt-2">
                  <input
                    id="password_new"
                    name="password"
                    type="password"
                    required
                    placeholder="Minimum 6 characters"
                    className="block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-600 sm:text-sm sm:leading-6 dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="role_new" className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-200">
                  Assigned Role
                </label>
                <div className="mt-2">
                  {userRole === 'admin' ? (
                    <select
                      id="role_new"
                      name="role"
                      className="block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-brand-600 sm:text-sm sm:leading-6 dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                    >
                      <option value="worker">Worker (Field activity log only)</option>
                      <option value="supervisor">Supervisor (Add calendar events, edit map)</option>
                    </select>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        id="role_new"
                        name="role"
                        disabled
                        value="worker"
                        className="block w-full rounded-xl border-0 py-2.5 px-3 text-slate-500 bg-slate-50 ring-1 ring-inset ring-slate-200 sm:text-sm sm:leading-6 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700 cursor-not-allowed"
                      >
                        <option value="worker">Worker (Field activity log only)</option>
                      </select>
                      {/* Hidden input to supply value since select is disabled */}
                      <input type="hidden" name="role" value="worker" />
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isTeamPending}
                  className="flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-70 disabled:cursor-not-allowed transition-all"
                >
                  {isTeamPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Team Member
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
