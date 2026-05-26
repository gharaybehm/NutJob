'use client'

import { useState, useCallback } from 'react'
import {
  updateProfile,
  updatePassword,
  updateUserRole,
  createWorker,
  updateBlockConfig,
} from './actions'
import {
  User,
  LockKeyhole,
  Mail,
  Phone,
  Loader2,
  Users,
  UserPlus,
  ShieldCheck,
  Layers,
  Bell,
  Cpu,
  Cloud,
  Check,
  Copy,
  Droplets,
  Thermometer,
  Wind,
  AlertTriangle,
  Info,
  Wifi,
  WifiOff,
  Save,
  RefreshCw,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Block {
  id: string
  name: string
  crop_type: string
  variety: string
  area: number
  area_unit: string
  field_capacity: number | null
  wilting_point: number | null
  notes: string | null
}

interface SettingsFormsProps {
  initialProfile: { email: string; full_name: string; phone: string }
  userRole: 'admin' | 'supervisor' | 'worker'
  allUsers?: {
    id: string
    full_name: string | null
    phone: string | null
    role: 'admin' | 'supervisor' | 'worker'
    created_at: string
  }[]
  blocks?: Block[]
}

type TabId = 'profile' | 'team' | 'blocks' | 'alerts' | 'sensors' | 'weather'

// ─── Notification default prefs ───────────────────────────────────────────────

const DEFAULT_PREFS = {
  soilMoistureLow: 25,     // % — alert when below this
  waterDeficitHigh: 40,    // mm — alert when above this
  tempHeatStress: 36,      // °C — alert when above this
  rainSkipIrrigation: 10,  // mm/day — skip irrigation if above
  pestRiskHigh: 70,        // % confidence — alert when pest risk above this
}
type NotifPrefs = typeof DEFAULT_PREFS

const STORAGE_KEY_PREFS   = 'nutjob:notification_prefs'
const STORAGE_KEY_WEATHER = 'nutjob:weather_coords'

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return { ...fallback, ...JSON.parse(raw) } as T
  } catch {
    return fallback
  }
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function StatusBanner({ status }: { status: { type: 'success' | 'error'; message: string } | null }) {
  if (!status) return null
  return (
    <div className={`p-4 rounded-xl text-sm border flex items-center gap-3 ${
      status.type === 'success'
        ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:border-green-800/50 dark:text-green-400'
        : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:border-red-800/50 dark:text-red-400'
    }`}>
      <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${status.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
      {status.message}
    </div>
  )
}

function SectionCard({ title, description, icon: Icon, children }: {
  title: string
  description?: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Icon className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

function InputField({ id, label, type = 'text', name, defaultValue, disabled, placeholder, prefix }: {
  id: string; label: string; type?: string; name?: string; defaultValue?: string | number
  disabled?: boolean; placeholder?: string; prefix?: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-200">
        {label}
      </label>
      <div className={`mt-2 ${prefix ? 'relative' : ''}`}>
        {prefix && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">{prefix}</div>
        )}
        <input
          id={id} name={name} type={type}
          defaultValue={defaultValue} disabled={disabled} placeholder={placeholder}
          className={`block w-full rounded-xl border-0 py-2.5 text-slate-900 shadow-sm ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-600 sm:text-sm sm:leading-6 dark:text-white dark:ring-slate-700 dark:placeholder:text-slate-500 ${
            prefix ? 'pl-10 pr-3' : 'px-3'
          } ${
            disabled
              ? 'bg-slate-50 text-slate-500 ring-slate-200 cursor-not-allowed dark:bg-slate-800 dark:text-slate-400'
              : 'bg-white ring-slate-300 dark:bg-slate-800'
          }`}
        />
      </div>
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

// ── Tab 1: Account & Security ─────────────────────────────────────────────────

function AccountTab({ initialProfile }: { initialProfile: { email: string; full_name: string; phone: string } }) {
  const [profileStatus, setProfileStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isProfilePending, setIsProfilePending] = useState(false)
  const [isPasswordPending, setIsPasswordPending] = useState(false)

  async function onProfileSubmit(formData: FormData) {
    setIsProfilePending(true); setProfileStatus(null)
    try {
      const res = await updateProfile(formData)
      if (res.error) setProfileStatus({ type: 'error', message: res.error })
      else if (res.success) setProfileStatus({ type: 'success', message: res.success })
    } catch { setProfileStatus({ type: 'error', message: 'Something went wrong' }) }
    setIsProfilePending(false)
  }

  async function onPasswordSubmit(formData: FormData) {
    setIsPasswordPending(true); setPasswordStatus(null)
    try {
      const res = await updatePassword(formData)
      if (res.error) setPasswordStatus({ type: 'error', message: res.error })
      else if (res.success) {
        setPasswordStatus({ type: 'success', message: res.success })
        ;(document.getElementById('password-form') as HTMLFormElement)?.reset()
      }
    } catch { setPasswordStatus({ type: 'error', message: 'Something went wrong' }) }
    setIsPasswordPending(false)
  }

  return (
    <div className="space-y-10">
      <SectionCard title="Profile Information" description="Update your personal details." icon={User}>
        <form action={onProfileSubmit} className="space-y-6 max-w-xl">
          <StatusBanner status={profileStatus} />
          <InputField id="email" label="Email address" type="email" defaultValue={initialProfile.email} disabled placeholder="email" prefix={<Mail className="h-5 w-5 text-slate-400" />} />
          <p className="-mt-4 text-xs text-slate-500">Email cannot be changed.</p>
          <InputField id="full_name" label="Full Name" name="full_name" defaultValue={initialProfile.full_name} />
          <InputField id="phone" label="Phone Number" name="phone" type="tel" defaultValue={initialProfile.phone} prefix={<Phone className="h-5 w-5 text-slate-400" />} />
          <button type="submit" disabled={isProfilePending} className="flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-70 transition-all">
            {isProfilePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Profile Changes
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Security" description="Update your password." icon={LockKeyhole}>
        <form id="password-form" action={onPasswordSubmit} className="space-y-6 max-w-xl">
          <StatusBanner status={passwordStatus} />
          <InputField id="password" label="New Password" name="password" type="password" />
          <InputField id="confirm_password" label="Confirm New Password" name="confirm_password" type="password" />
          <button type="submit" disabled={isPasswordPending} className="flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-70 transition-all">
            {isPasswordPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update Password
          </button>
        </form>
      </SectionCard>
    </div>
  )
}

// ── Tab 2: Team Management ────────────────────────────────────────────────────

function TeamTab({
  userRole,
  initialProfile,
  allUsers,
}: {
  userRole: 'admin' | 'supervisor' | 'worker'
  initialProfile: { email: string; full_name: string; phone: string }
  allUsers: { id: string; full_name: string | null; phone: string | null; role: 'admin' | 'supervisor' | 'worker'; created_at: string }[]
}) {
  const [teamStatus, setTeamStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isTeamPending, setIsTeamPending] = useState(false)
  const [roleUpdateStatus, setRoleUpdateStatus] = useState<Record<string, { type: 'success' | 'error'; message: string }>>({})
  const [isRolePending, setIsRolePending] = useState<Record<string, boolean>>({})

  async function handleRoleChange(userId: string, newRole: 'admin' | 'supervisor' | 'worker') {
    setIsRolePending(prev => ({ ...prev, [userId]: true }))
    setRoleUpdateStatus(prev => { const next = { ...prev }; delete next[userId]; return next })
    try {
      const res = await updateUserRole(userId, newRole)
      if (res.error) setRoleUpdateStatus(prev => ({ ...prev, [userId]: { type: 'error', message: res.error } }))
      else if (res.success) setRoleUpdateStatus(prev => ({ ...prev, [userId]: { type: 'success', message: res.success } }))
    } catch { setRoleUpdateStatus(prev => ({ ...prev, [userId]: { type: 'error', message: 'Failed to update' } })) }
    setIsRolePending(prev => ({ ...prev, [userId]: false }))
  }

  async function onNewWorkerSubmit(formData: FormData) {
    setIsTeamPending(true); setTeamStatus(null)
    try {
      const res = await createWorker(formData)
      if (res.error) setTeamStatus({ type: 'error', message: res.error })
      else if (res.success) {
        setTeamStatus({ type: 'success', message: res.success })
        ;(document.getElementById('new-worker-form') as HTMLFormElement)?.reset()
      }
    } catch { setTeamStatus({ type: 'error', message: 'Something went wrong' }) }
    setIsTeamPending(false)
  }

  const roleBadge = (role: string) => {
    const cfg = role === 'admin'
      ? 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400'
      : role === 'supervisor'
      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400'
      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400'
    return <span className={`text-xs font-bold tracking-wider uppercase px-2 py-0.5 rounded-md ${cfg}`}>{role}</span>
  }

  return (
    <div className="space-y-10">
      <SectionCard title="Team Roles & Access Control" icon={ShieldCheck}
        description={userRole === 'admin' ? 'Manage user access levels. Changes take effect on next login.' : 'View current team access levels (Admins only can modify roles).'}>
        {allUsers.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-sm">No registered team members found.</div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead>
                <tr>
                  {['Name', 'Phone', 'Role', ...(userRole === 'admin' ? [''] : [])].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {allUsers.map((u) => {
                  const isSelf = u.full_name === initialProfile.full_name && u.phone === initialProfile.phone
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900 dark:text-white">{u.full_name || 'Anonymous'}</span>
                          {isSelf && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-950/20 dark:text-brand-400">You</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">{u.phone || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {userRole === 'admin' && !isSelf ? (
                          <select defaultValue={u.role} onChange={(e) => handleRoleChange(u.id, e.target.value as 'admin' | 'supervisor' | 'worker')} disabled={isRolePending[u.id]}
                            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50">
                            <option value="admin">Admin</option>
                            <option value="supervisor">Supervisor</option>
                            <option value="worker">Worker</option>
                          </select>
                        ) : roleBadge(u.role)}
                      </td>
                      {userRole === 'admin' && (
                        <td className="px-4 py-3 whitespace-nowrap text-right text-xs">
                          {roleUpdateStatus[u.id] && <span className={roleUpdateStatus[u.id].type === 'success' ? 'text-green-600 font-medium' : 'text-red-500'}>{roleUpdateStatus[u.id].message}</span>}
                          {isRolePending[u.id] && <Loader2 className="inline h-4 w-4 animate-spin text-brand-600" />}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Add Team Member" icon={UserPlus}
        description={userRole === 'admin' ? 'Create a new Supervisor or Worker. They can log in immediately with these credentials.' : 'Create a new Worker account.'}>
        <form id="new-worker-form" action={onNewWorkerSubmit} className="space-y-5 max-w-xl">
          <StatusBanner status={teamStatus} />
          <InputField id="full_name_new" label="Full Name" name="full_name" placeholder="e.g. Ahmet Yılmaz" />
          <InputField id="email_new" label="Email Address" name="email" type="email" placeholder="worker@farm.com" />
          <InputField id="password_new" label="Temporary Password" name="password" type="password" placeholder="Minimum 6 characters" />
          <div>
            <label htmlFor="role_new" className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-200">Assigned Role</label>
            <div className="mt-2">
              {userRole === 'admin' ? (
                <select id="role_new" name="role" className="block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-brand-600 sm:text-sm sm:leading-6 dark:bg-slate-800 dark:text-white dark:ring-slate-700">
                  <option value="worker">Worker (Field activity log only)</option>
                  <option value="supervisor">Supervisor (Add calendar events, edit map)</option>
                </select>
              ) : (
                <>
                  <select id="role_new" disabled value="worker" className="block w-full rounded-xl border-0 py-2.5 px-3 text-slate-500 bg-slate-50 ring-1 ring-inset ring-slate-200 sm:text-sm dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700 cursor-not-allowed">
                    <option value="worker">Worker (Field activity log only)</option>
                  </select>
                  <input type="hidden" name="role" value="worker" />
                </>
              )}
            </div>
          </div>
          <button type="submit" disabled={isTeamPending} className="flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-70 transition-all">
            {isTeamPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Team Member
          </button>
        </form>
      </SectionCard>
    </div>
  )
}

// ── Tab 3: Block Configuration ────────────────────────────────────────────────

function BlockRow({ block }: { block: Block }) {
  const [fieldCapacity, setFieldCapacity] = useState(block.field_capacity?.toString() ?? '')
  const [wiltingPoint, setWiltingPoint] = useState(block.wilting_point?.toString() ?? '')
  const [notes, setNotes] = useState(block.notes ?? '')
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isPending, setIsPending] = useState(false)

  async function handleSave() {
    setIsPending(true); setStatus(null)
    try {
      const res = await updateBlockConfig(block.id, {
        fieldCapacity: fieldCapacity ? parseFloat(fieldCapacity) : null,
        wiltingPoint: wiltingPoint ? parseFloat(wiltingPoint) : null,
        notes: notes.trim() || null,
      })
      if (res.error) setStatus({ type: 'error', message: res.error })
      else setStatus({ type: 'success', message: 'Saved' })
    } catch { setStatus({ type: 'error', message: 'Save failed' }) }
    setIsPending(false)
    setTimeout(() => setStatus(null), 3000)
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{block.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {block.crop_type} · {block.variety} · {block.area} {block.area_unit}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {status && (
            <span className={`text-xs font-medium ${status.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {status.type === 'success' ? <span className="flex items-center gap-1"><Check className="h-3 w-3" />{status.message}</span> : status.message}
            </span>
          )}
          <button onClick={handleSave} disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors">
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
            Field Capacity (%)
          </label>
          <div className="relative">
            <input type="number" min="0" max="100" step="0.1" value={fieldCapacity}
              onChange={e => setFieldCapacity(e.target.value)} placeholder="e.g. 35"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition placeholder:text-slate-400" />
            {fieldCapacity && (
              <div className="mt-1.5">
                <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full bg-blue-400 dark:bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min(parseFloat(fieldCapacity), 100)}%` }} />
                </div>
              </div>
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Soil moisture at saturation — irrigation ceiling</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
            Wilting Point (%)
          </label>
          <div className="relative">
            <input type="number" min="0" max="100" step="0.1" value={wiltingPoint}
              onChange={e => setWiltingPoint(e.target.value)} placeholder="e.g. 15"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition placeholder:text-slate-400" />
            {wiltingPoint && (
              <div className="mt-1.5">
                <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full bg-amber-400 dark:bg-amber-500 rounded-full transition-all" style={{ width: `${Math.min(parseFloat(wiltingPoint), 100)}%` }} />
                </div>
              </div>
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Minimum moisture before stress — irrigation floor</p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
          Notes
        </label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Soil type, irrigation method, special notes…"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-slate-400 resize-none transition" />
      </div>
    </div>
  )
}

function BlockConfigTab({ blocks }: { blocks: Block[] }) {
  if (blocks.length === 0) {
    return (
      <SectionCard title="Block Configuration" icon={Layers} description="Set water thresholds and notes for each block. These values are used by the AI recommendation engine.">
        <div className="text-center py-8 text-slate-400 text-sm">
          No blocks found. Create blocks on the <a href="/blocks" className="text-brand-600 dark:text-brand-400 underline underline-offset-2">Blocks page</a> first.
        </div>
      </SectionCard>
    )
  }
  return (
    <SectionCard title="Block Configuration" icon={Layers}
      description="Set field capacity and wilting point thresholds per block. These are used by the AI engine to calculate water deficit and irrigation urgency.">
      <div className="space-y-4">
        {blocks.map(b => <BlockRow key={b.id} block={b} />)}
      </div>
    </SectionCard>
  )
}

// ── Tab 4: Notification Alerts ────────────────────────────────────────────────

function ThresholdSlider({ id, label, description, icon: Icon, value, onChange, min, max, step, unit, colorClass }: {
  id: string; label: string; description: string; icon: React.ElementType
  value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit: string; colorClass: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
          <Icon className={`h-4 w-4 ${colorClass}`} />
          {label}
        </label>
        <div className="flex items-center gap-1">
          <input type="number" value={value} min={min} max={max} step={step}
            onChange={e => onChange(parseFloat(e.target.value) || min)}
            className="w-16 text-right px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand-500" />
          <span className="text-xs text-slate-500 dark:text-slate-400 w-8">{unit}</span>
        </div>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ background: `linear-gradient(to right, var(--color-brand-500) ${pct}%, #e2e8f0 ${pct}%)` }}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-600 [&::-webkit-slider-thumb]:shadow-sm" />
      <p className="text-xs text-slate-400 dark:text-slate-500">{description}</p>
    </div>
  )
}

function NotificationAlertsTab() {
  const [prefs, setPrefs] = useState<NotifPrefs>(() => loadFromStorage(STORAGE_KEY_PREFS, DEFAULT_PREFS))
  const [saved, setSaved] = useState(false)

  const update = useCallback((key: keyof NotifPrefs, val: number) => {
    setPrefs(prev => ({ ...prev, [key]: val }))
  }, [])

  function handleSave() {
    localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(prefs))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function handleReset() {
    setPrefs(DEFAULT_PREFS)
    localStorage.removeItem(STORAGE_KEY_PREFS)
    setSaved(false)
  }

  return (
    <SectionCard title="Notification Alert Thresholds" icon={Bell}
      description="Configure when alerts fire across the dashboard and block panels. These settings are stored locally on this device.">
      <div className="space-y-8 max-w-xl">
        <ThresholdSlider id="soil-moisture-low" label="Soil Moisture — Low Alert" description="Alert fires when a block's soil moisture reading falls below this level."
          icon={Droplets} colorClass="text-blue-500" value={prefs.soilMoistureLow} onChange={v => update('soilMoistureLow', v)} min={5} max={50} step={1} unit="%" />
        <ThresholdSlider id="water-deficit-high" label="Water Deficit — Critical" description="Alert fires when estimated water deficit exceeds this amount."
          icon={Droplets} colorClass="text-amber-500" value={prefs.waterDeficitHigh} onChange={v => update('waterDeficitHigh', v)} min={10} max={100} step={5} unit="mm" />
        <ThresholdSlider id="temp-heat-stress" label="Heat Stress Temperature" description="Alert fires when the forecast high exceeds this temperature."
          icon={Thermometer} colorClass="text-red-500" value={prefs.tempHeatStress} onChange={v => update('tempHeatStress', v)} min={28} max={48} step={1} unit="°C" />
        <ThresholdSlider id="rain-skip" label="Rainfall — Skip Irrigation" description="If forecast or recorded rainfall exceeds this, the AI will recommend skipping irrigation."
          icon={Wind} colorClass="text-teal-500" value={prefs.rainSkipIrrigation} onChange={v => update('rainSkipIrrigation', v)} min={2} max={30} step={1} unit="mm" />
        <ThresholdSlider id="pest-risk" label="Pest Risk — High Alert" description="Alert fires when AI pest risk score exceeds this confidence threshold."
          icon={AlertTriangle} colorClass="text-orange-500" value={prefs.pestRiskHigh} onChange={v => update('pestRiskHigh', v)} min={40} max={95} step={5} unit="%" />

        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleSave} className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 transition-all">
            {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? 'Saved!' : 'Save Thresholds'}
          </button>
          <button onClick={handleReset} className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <RefreshCw className="h-4 w-4" />
            Reset to Defaults
          </button>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3">
          <Info className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Alert thresholds are currently stored in your browser. They will persist across page reloads but not across different devices or browsers.
          </p>
        </div>
      </div>
    </SectionCard>
  )
}

// ── Tab 5: Sensor Connections ─────────────────────────────────────────────────

const SENSOR_CHANNELS = [
  { name: 'Soil Moisture', unit: '%', icon: Droplets, color: 'text-blue-500' },
  { name: 'Soil EC', unit: 'dS/m', icon: Cpu, color: 'text-purple-500' },
  { name: 'Soil Temperature', unit: '°C', icon: Thermometer, color: 'text-orange-500' },
  { name: 'Air Humidity', unit: '%', icon: Wind, color: 'text-teal-500' },
  { name: 'Wind Speed', unit: 'km/h', icon: Wind, color: 'text-slate-500' },
  { name: 'Rainfall', unit: 'mm', icon: Droplets, color: 'text-indigo-500' },
]

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={handleCopy} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function SensorConnectionsTab() {
  const webhookBase = typeof window !== 'undefined'
    ? `${window.location.origin}/api/ingest`
    : 'https://your-domain.netlify.app/api/ingest'

  return (
    <div className="space-y-8">
      <SectionCard title="Sensor Channels" icon={Cpu}
        description="Current status of each sensor channel. Manual entry via the Lab Test modal is available on the Blocks page while physical sensors are not yet connected.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SENSOR_CHANNELS.map(ch => {
            const Icon = ch.icon
            return (
              <div key={ch.name} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-white dark:bg-slate-900 flex items-center justify-center shadow-sm">
                    <Icon className={`h-4 w-4 ${ch.color}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{ch.name}</p>
                    <p className="text-xs text-slate-400">{ch.unit}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <WifiOff className="h-3.5 w-3.5" />
                  Not connected
                </div>
              </div>
            )
          })}
        </div>
      </SectionCard>

      <SectionCard title="Ingest Endpoints" icon={Wifi}
        description="Once you have physical sensors or a data logger, push readings to these REST endpoints. Each endpoint accepts POST with JSON payload.">
        <div className="space-y-3">
          {[
            { path: '/soil', label: 'Soil Readings', payload: '{ "block_id": "...", "moisture": 28.5, "ec": 1.2, "temp": 22.4 }' },
            { path: '/weather', label: 'Weather Snapshot', payload: '{ "temp_c": 34.0, "humidity_pct": 42, "rainfall_mm": 0, "wind_kmh": 18 }' },
            { path: '/alert', label: 'Custom Alert', payload: '{ "block_id": "...", "domain": "soil-water", "severity": "warning", "message": "..." }' },
          ].map(ep => (
            <div key={ep.path} className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-400">POST</span>
                  <code className="text-sm font-mono text-slate-700 dark:text-slate-300">{webhookBase}{ep.path}</code>
                </div>
                <CopyButton text={`${webhookBase}${ep.path}`} />
              </div>
              <div className="px-4 py-3">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{ep.label} — Example Payload</p>
                <code className="text-xs text-slate-600 dark:text-slate-300 font-mono">{ep.payload}</code>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            These endpoints are not yet active. Manual data entry via <strong>Log Activity</strong> and <strong>Log Test Result</strong> (on the Blocks page) is the recommended workflow until sensor hardware is connected.
          </p>
        </div>
      </SectionCard>
    </div>
  )
}

// ── Tab 6: Weather API ────────────────────────────────────────────────────────

const DEFAULT_WEATHER = { lat: '36.8969', lng: '30.7133' } // Antalya default

function WeatherAPITab() {
  const [coords, setCoords] = useState(() => loadFromStorage(STORAGE_KEY_WEATHER, DEFAULT_WEATHER))
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'error' | null>(null)

  function handleSave() {
    localStorage.setItem(STORAGE_KEY_WEATHER, JSON.stringify(coords))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function handleTest() {
    setTesting(true); setTestResult(null)
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}&current_weather=true`
      const res = await fetch(url)
      setTestResult(res.ok ? 'ok' : 'error')
    } catch { setTestResult('error') }
    setTesting(false)
  }

  return (
    <div className="space-y-8">
      <SectionCard title="Open-Meteo Weather" icon={Cloud}
        description="Open-Meteo is a free, open-source weather API used for the dashboard weather strip and 7-day forecast. No API key required.">
        <div className="space-y-6 max-w-lg">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50">
            <Wifi className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800 dark:text-green-300">Open-Meteo — Connected</p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">Free tier · No API key · Updates every hour</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="lat" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Latitude</label>
              <input id="lat" type="number" step="0.0001" value={coords.lat} onChange={e => setCoords(c => ({ ...c, lat: e.target.value }))}
                placeholder="e.g. 36.8969"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition" />
            </div>
            <div>
              <label htmlFor="lng" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Longitude</label>
              <input id="lng" type="number" step="0.0001" value={coords.lng} onChange={e => setCoords(c => ({ ...c, lng: e.target.value }))}
                placeholder="e.g. 30.7133"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition" />
            </div>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 -mt-2">Enter your farm&apos;s GPS coordinates. Used by the Dashboard weather strip and 7-day forecast.</p>

          <div className="flex items-center gap-3">
            <button onClick={handleSave} className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 transition-all">
              {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saved ? 'Saved!' : 'Save Coordinates'}
            </button>
            <button onClick={handleTest} disabled={testing} className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Test Connection
            </button>
          </div>
          {testResult === 'ok' && (
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
              <Check className="h-4 w-4" /> Connection successful — Open-Meteo is reachable for these coordinates.
            </div>
          )}
          {testResult === 'error' && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <WifiOff className="h-4 w-4" /> Connection failed — check the coordinates and your internet connection.
            </div>
          )}

          <div className="flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3">
            <Info className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Coordinates are stored locally in your browser. A future update will persist these globally to Supabase so all team members use the same farm location.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="AI Recommendation Engine" icon={Cpu}
        description="AI recommendations are generated via OpenRouter. Set your API key in environment variables to enable the Generate AI Insights button.">
        <div className="space-y-4 max-w-lg">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Model</label>
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
              <Cpu className="h-4 w-4 text-brand-500 shrink-0" />
              <span className="text-sm text-slate-700 dark:text-slate-300 font-mono">google/gemini-2.5-flash</span>
              <span className="ml-auto text-xs text-slate-400">via OpenRouter</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">API Key</label>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
              {process.env.NEXT_PUBLIC_OPENROUTER_CONFIGURED === 'true' ? (
                <><Wifi className="h-4 w-4 text-green-500 shrink-0" /><span className="text-xs text-green-700 dark:text-green-400 font-medium">OPENROUTER_API_KEY configured</span></>
              ) : (
                <><WifiOff className="h-4 w-4 text-slate-400 shrink-0" /><span className="text-xs text-slate-500">Set <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">OPENROUTER_API_KEY</code> in .env.local or your deployment environment</span></>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3">
            <Info className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Get a free API key at <span className="font-medium text-slate-600 dark:text-slate-300">openrouter.ai</span>. The key is read server-side only and never exposed to the browser.
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

// ─── Main SettingsForms component ─────────────────────────────────────────────

export default function SettingsForms({
  initialProfile,
  userRole = 'worker',
  allUsers = [],
  blocks = [],
}: SettingsFormsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('profile')

  const tabs: { id: TabId; label: string; icon: React.ElementType; show: boolean }[] = [
    { id: 'profile' as TabId,  label: 'Account & Security', icon: User,       show: true },
    { id: 'team'    as TabId,  label: 'Team',               icon: Users,      show: userRole === 'admin' || userRole === 'supervisor' },
    { id: 'blocks'  as TabId,  label: 'Block Config',        icon: Layers,     show: userRole === 'admin' || userRole === 'supervisor' },
    { id: 'alerts'  as TabId,  label: 'Alert Thresholds',   icon: Bell,       show: userRole === 'admin' || userRole === 'supervisor' },
    { id: 'sensors' as TabId,  label: 'Sensors',             icon: Cpu,        show: userRole === 'admin' },
    { id: 'weather' as TabId,  label: 'Weather & AI',        icon: Cloud,      show: userRole === 'admin' },
  ].filter(t => t.show)

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-800 pb-px gap-1 scrollbar-hide">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold tracking-tight whitespace-nowrap border-b-2 transition-all -mb-px ${
                isActive
                  ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}>
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'profile' && <AccountTab initialProfile={initialProfile} />}
      {activeTab === 'team'    && <TeamTab userRole={userRole} initialProfile={initialProfile} allUsers={allUsers} />}
      {activeTab === 'blocks'  && <BlockConfigTab blocks={blocks} />}
      {activeTab === 'alerts'  && <NotificationAlertsTab />}
      {activeTab === 'sensors' && <SensorConnectionsTab />}
      {activeTab === 'weather' && <WeatherAPITab />}
    </div>
  )
}
