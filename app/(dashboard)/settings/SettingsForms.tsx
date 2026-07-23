'use client'

import { useState, useCallback, useEffect } from 'react'
import { subscribeToPush, unsubscribeFromPush } from '@/app/components/ServiceWorkerRegistration'
import {
  updateProfile,
  updatePassword,
  updateUserRole,
  removeMember,
  createWorker,
  updateBlockConfig,
  setLocale,
  registerSensor,
  updateSensor,
  deleteSensor,
  generateSensorApiKey,
  saveSensecapCredentials,
  testSensecapConnection,
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
  Building2,
  Globe,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  X,
} from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { updateFarm, deleteFarm } from '@/app/actions/farms'
import type { SensorWithBlock, SensorFormValues, SensorType } from '@/types/sensors'
import { SENSOR_TYPE_LABELS } from '@/types/sensors'

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
  currentUserId: string
  userRole: 'admin' | 'supervisor' | 'worker'
  allUsers?: {
    id: string
    full_name: string | null
    phone: string | null
    role: 'admin' | 'supervisor' | 'worker'
    created_at: string
  }[]
  blocks?: Block[]
  farmId?: string
  farmName?: string
  farmAddress?: string
  farmGpsLat?: number | null
  farmGpsLng?: number | null
  sensors?: SensorWithBlock[]
  initialSensecapApiId?: string | null
  initialSensecapAccessKey?: string | null
}

type TabId = 'profile' | 'team' | 'blocks' | 'alerts' | 'sensors' | 'weather' | 'language'

// ─── Notification default prefs ───────────────────────────────────────────────

const DEFAULT_PREFS = {
  soilMoistureLow: 25,     // % — alert when below this
  waterDeficitHigh: 40,    // mm — alert when above this
  tempHeatStress: 36,      // °C — alert when above this
  rainSkipIrrigation: 10,  // mm/day — skip irrigation if above
  pestRiskHigh: 70,        // % confidence — alert when pest risk above this
}
type NotifPrefs = typeof DEFAULT_PREFS

const STORAGE_KEY_PREFS = 'rootloot:notification_prefs'

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
        ? 'bg-green-soft text-green border-green/25'
        : 'bg-red-soft text-red border-red/25'
    }`}>
      <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${status.type === 'success' ? 'bg-green' : 'bg-red'}`} />
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
    <section className="rounded-2xl bg-surface p-8 shadow-sm ring-1 ring-line">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
          <Icon className="h-5 w-5 text-green" />
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-ink-3">{description}</p>
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
      <label htmlFor={id} className="block text-sm font-medium leading-6 text-ink">
        {label}
      </label>
      <div className={`mt-2 ${prefix ? 'relative' : ''}`}>
        {prefix && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">{prefix}</div>
        )}
        <input
          id={id} name={name} type={type}
          defaultValue={defaultValue} disabled={disabled} placeholder={placeholder}
          className={`block w-full rounded-xl border-0 py-2.5 text-ink shadow-sm ring-1 ring-inset placeholder:text-ink-4 focus:ring-2 focus:ring-inset focus:ring-green sm:text-sm sm:leading-6 ${
            prefix ? 'pl-10 pr-3' : 'px-3'
          } ${
            disabled
              ? 'bg-tile text-ink-3 ring-line cursor-not-allowed'
              : 'bg-surface ring-line'
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
          <InputField id="email" label="Email address" type="email" defaultValue={initialProfile.email} disabled placeholder="email" prefix={<Mail className="h-5 w-5 text-ink-4" />} />
          <p className="-mt-4 text-xs text-ink-3">Email cannot be changed.</p>
          <InputField id="full_name" label="Full Name" name="full_name" defaultValue={initialProfile.full_name} />
          <InputField id="phone" label="Phone Number" name="phone" type="tel" defaultValue={initialProfile.phone} prefix={<Phone className="h-5 w-5 text-ink-4" />} />
          <button type="submit" disabled={isProfilePending} className="flex items-center justify-center rounded-xl bg-green px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-70 transition-all">
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
          <button type="submit" disabled={isPasswordPending} className="flex items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-tile-2 disabled:opacity-70 transition-all">
            {isPasswordPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update Password
          </button>
        </form>
      </SectionCard>
    </div>
  )
}

// ── Tab 2: Team Management ────────────────────────────────────────────────────

function buildInviteMessage(farmName: string, email: string, password: string) {
  const url = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `You've been added to the ${farmName} team on NutJob. Log in at ${url} with:\nEmail: ${email}\nTemporary password: ${password}\nPlease log in and change your password.`
}

function TeamTab({
  userRole,
  currentUserId,
  allUsers,
  farmId,
  farmName,
}: {
  userRole: 'admin' | 'supervisor' | 'worker'
  currentUserId: string
  allUsers: { id: string; full_name: string | null; phone: string | null; role: 'admin' | 'supervisor' | 'worker'; created_at: string }[]
  farmId: string
  farmName?: string
}) {
  const router = useRouter()
  const [teamStatus, setTeamStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isTeamPending, setIsTeamPending] = useState(false)
  const [roleUpdateStatus, setRoleUpdateStatus] = useState<Record<string, { type: 'success' | 'error'; message: string }>>({})
  const [isRolePending, setIsRolePending] = useState<Record<string, boolean>>({})
  const [newInvite, setNewInvite] = useState<{ email: string; password: string } | null>(null)
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null)
  const [isRemovePending, setIsRemovePending] = useState<Record<string, boolean>>({})

  async function handleRoleChange(userId: string, newRole: 'admin' | 'supervisor' | 'worker') {
    setIsRolePending(prev => ({ ...prev, [userId]: true }))
    setRoleUpdateStatus(prev => { const next = { ...prev }; delete next[userId]; return next })
    try {
      const res = await updateUserRole(farmId, userId, newRole)
      if (res.error) setRoleUpdateStatus(prev => ({ ...prev, [userId]: { type: 'error', message: res.error } }))
      else if (res.success) setRoleUpdateStatus(prev => ({ ...prev, [userId]: { type: 'success', message: res.success } }))
    } catch { setRoleUpdateStatus(prev => ({ ...prev, [userId]: { type: 'error', message: 'Failed to update' } })) }
    setIsRolePending(prev => ({ ...prev, [userId]: false }))
  }

  async function handleRemoveMember(userId: string) {
    setIsRemovePending(prev => ({ ...prev, [userId]: true }))
    setRoleUpdateStatus(prev => { const next = { ...prev }; delete next[userId]; return next })
    try {
      const res = await removeMember(farmId, userId)
      if (res.error) {
        setRoleUpdateStatus(prev => ({ ...prev, [userId]: { type: 'error', message: res.error } }))
        setRemoveConfirm(null)
      } else if (res.success) {
        router.refresh()
      }
    } catch {
      setRoleUpdateStatus(prev => ({ ...prev, [userId]: { type: 'error', message: 'Failed to remove' } }))
      setRemoveConfirm(null)
    }
    setIsRemovePending(prev => ({ ...prev, [userId]: false }))
  }

  async function onNewWorkerSubmit(formData: FormData) {
    setIsTeamPending(true); setTeamStatus(null); setNewInvite(null)
    try {
      const res = await createWorker(farmId, formData)
      if (res.error) setTeamStatus({ type: 'error', message: res.error })
      else if (res.success) {
        setTeamStatus({ type: res.warning ? 'error' : 'success', message: res.warning || res.success })
        if (res.isNewUser) {
          setNewInvite({ email: formData.get('email') as string, password: formData.get('password') as string })
        }
        ;(document.getElementById('new-worker-form') as HTMLFormElement)?.reset()
        router.refresh()
      }
    } catch { setTeamStatus({ type: 'error', message: 'Something went wrong' }) }
    setIsTeamPending(false)
  }

  const roleBadge = (role: string) => {
    const cfg = role === 'admin'
      ? 'bg-red-soft text-red'
      : role === 'supervisor'
      ? 'bg-blue-soft text-blue'
      : 'bg-green-soft text-green'
    return <span className={`text-xs font-bold tracking-wider uppercase px-2 py-0.5 rounded-md ${cfg}`}>{role}</span>
  }

  return (
    <div className="space-y-10">
      <SectionCard title="Team Roles & Access Control" icon={ShieldCheck}
        description={userRole === 'admin' ? 'Manage user access levels. Changes take effect on next login.' : 'View current team access levels (Admins only can modify roles).'}>
        {allUsers.length === 0 ? (
          <div className="text-center py-6 text-ink-4 text-sm">No registered team members found.</div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="min-w-full divide-y divide-line">
              <thead>
                <tr>
                  {['Name', 'Phone', 'Role', ...(userRole === 'admin' ? [''] : [])].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-tile">
                {allUsers.map((u) => {
                  const isSelf = u.id === currentUserId
                  return (
                    <tr key={u.id} className="hover:bg-tile/50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-ink">{u.full_name || 'Anonymous'}</span>
                          {isSelf && <span className="rounded bg-green-soft px-1.5 py-0.5 text-[10px] font-semibold text-green">You</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-ink-3">{u.phone || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {userRole === 'admin' && !isSelf ? (
                          <select defaultValue={u.role} onChange={(e) => handleRoleChange(u.id, e.target.value as 'admin' | 'supervisor' | 'worker')} disabled={isRolePending[u.id]}
                            className="rounded-lg border border-line bg-surface px-2 py-1 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-green disabled:opacity-50">
                            <option value="admin">Admin</option>
                            <option value="supervisor">Supervisor</option>
                            <option value="worker">Worker</option>
                          </select>
                        ) : roleBadge(u.role)}
                      </td>
                      {userRole === 'admin' && (
                        <td className="px-4 py-3 whitespace-nowrap text-right text-xs">
                          {roleUpdateStatus[u.id] && <span className={roleUpdateStatus[u.id].type === 'success' ? 'text-green font-medium' : 'text-red'}>{roleUpdateStatus[u.id].message}</span>}
                          {isRolePending[u.id] && <Loader2 className="inline h-4 w-4 animate-spin text-green" />}
                          {!isSelf && (
                            removeConfirm === u.id ? (
                              <span className="ml-2 inline-flex items-center gap-2">
                                <span className="text-ink-3">Confirm remove?</span>
                                <button type="button" onClick={() => handleRemoveMember(u.id)} disabled={isRemovePending[u.id]}
                                  className="font-semibold text-red hover:brightness-110 disabled:opacity-50">
                                  {isRemovePending[u.id] ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : 'Remove'}
                                </button>
                                <button type="button" onClick={() => setRemoveConfirm(null)} disabled={isRemovePending[u.id]}
                                  className="text-ink-3 hover:text-ink-2 disabled:opacity-50">
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button type="button" onClick={() => setRemoveConfirm(u.id)}
                                className="ml-2 text-red hover:brightness-110">
                                Remove
                              </button>
                            )
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
      </SectionCard>

      <SectionCard title="Add Team Member" icon={UserPlus}
        description={userRole === 'admin' ? 'Create a new Supervisor or Worker. They can log in immediately with these credentials.' : 'Create a new Worker account.'}>
        <form id="new-worker-form" action={onNewWorkerSubmit} className="space-y-5 max-w-xl">
          <StatusBanner status={teamStatus} />
          {newInvite && (
            <div className="rounded-xl border border-line bg-tile/50 p-4 space-y-3">
              <p className="text-sm font-semibold text-ink">Share these credentials with the new team member</p>
              <div className="space-y-1 text-sm text-ink-2">
                <p><span className="text-ink-4">Farm:</span> {farmName || '—'}</p>
                <p><span className="text-ink-4">Email:</span> {newInvite.email}</p>
                <p><span className="text-ink-4">Temporary password:</span> {newInvite.password}</p>
                <p><span className="text-ink-4">Login URL:</span> {process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setNewInvite(null)} className="text-xs text-ink-3 hover:text-ink-2">Dismiss</button>
                <span className="ml-auto flex items-center gap-1 text-xs font-medium text-ink-2">
                  Copy invite message
                  <CopyButton text={buildInviteMessage(farmName || 'your farm', newInvite.email, newInvite.password)} />
                </span>
              </div>
            </div>
          )}
          <InputField id="full_name_new" label="Full Name" name="full_name" placeholder="e.g. Ahmet Yılmaz" />
          <InputField id="email_new" label="Email Address" name="email" type="email" placeholder="worker@farm.com" />
          <InputField id="password_new" label="Temporary Password" name="password" type="password" placeholder="Minimum 6 characters" />
          <p className="-mt-3 text-xs text-ink-3">If this email already has an account elsewhere, they&apos;ll be added to this farm directly — password and name above will be ignored.</p>
          <div>
            <label htmlFor="role_new" className="block text-sm font-medium leading-6 text-ink">Assigned Role</label>
            <div className="mt-2">
              {userRole === 'admin' ? (
                <select id="role_new" name="role" className="block w-full rounded-xl border-0 py-2.5 px-3 text-ink shadow-sm ring-1 ring-inset ring-line focus:ring-2 focus:ring-inset focus:ring-green sm:text-sm sm:leading-6">
                  <option value="worker">Worker (Field activity log only)</option>
                  <option value="supervisor">Supervisor (Add calendar events, edit map)</option>
                </select>
              ) : (
                <>
                  <select id="role_new" disabled value="worker" className="block w-full rounded-xl border-0 py-2.5 px-3 text-ink-3 bg-tile ring-1 ring-inset ring-line sm:text-sm cursor-not-allowed">
                    <option value="worker">Worker (Field activity log only)</option>
                  </select>
                  <input type="hidden" name="role" value="worker" />
                </>
              )}
            </div>
          </div>
          <button type="submit" disabled={isTeamPending} className="flex items-center justify-center rounded-xl bg-green px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-70 transition-all">
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
    <div className="rounded-xl border border-line p-5 space-y-4 hover:border-line transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">{block.name}</p>
          <p className="text-xs text-ink-3 mt-0.5">
            {block.crop_type} · {block.variety} · {block.area} {block.area_unit}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {status && (
            <span className={`text-xs font-medium ${status.type === 'success' ? 'text-green' : 'text-red'}`}>
              {status.type === 'success' ? <span className="flex items-center gap-1"><Check className="h-3 w-3" />{status.message}</span> : status.message}
            </span>
          )}
          <button onClick={handleSave} disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg bg-green px-3 py-1.5 text-xs font-semibold text-white hover:brightness-105 disabled:opacity-60 transition-colors">
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-ink-3 uppercase tracking-wider mb-1.5">
            Field Capacity (%)
          </label>
          <div className="relative">
            <input type="number" min="0" max="100" step="0.1" value={fieldCapacity}
              onChange={e => setFieldCapacity(e.target.value)} placeholder="e.g. 35"
              className="w-full px-3 py-2 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-green transition placeholder:text-ink-4" />
            {fieldCapacity && (
              <div className="mt-1.5">
                <div className="h-1.5 rounded-full bg-tile overflow-hidden">
                  <div className="h-full bg-blue rounded-full transition-all" style={{ width: `${Math.min(parseFloat(fieldCapacity), 100)}%` }} />
                </div>
              </div>
            )}
          </div>
          <p className="mt-1 text-[11px] text-ink-4">Soil moisture at saturation — irrigation ceiling</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-3 uppercase tracking-wider mb-1.5">
            Wilting Point (%)
          </label>
          <div className="relative">
            <input type="number" min="0" max="100" step="0.1" value={wiltingPoint}
              onChange={e => setWiltingPoint(e.target.value)} placeholder="e.g. 15"
              className="w-full px-3 py-2 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-green transition placeholder:text-ink-4" />
            {wiltingPoint && (
              <div className="mt-1.5">
                <div className="h-1.5 rounded-full bg-tile overflow-hidden">
                  <div className="h-full bg-amber rounded-full transition-all" style={{ width: `${Math.min(parseFloat(wiltingPoint), 100)}%` }} />
                </div>
              </div>
            )}
          </div>
          <p className="mt-1 text-[11px] text-ink-4">Minimum moisture before stress — irrigation floor</p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-ink-3 uppercase tracking-wider mb-1.5">
          Notes
        </label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Soil type, irrigation method, special notes…"
          className="w-full px-3 py-2 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-green placeholder:text-ink-4 resize-none transition" />
      </div>
    </div>
  )
}

function BlockConfigTab({ blocks }: { blocks: Block[] }) {
  if (blocks.length === 0) {
    return (
      <SectionCard title="Block Configuration" icon={Layers} description="Set water thresholds and notes for each block. These values are used by the AI recommendation engine.">
        <div className="text-center py-8 text-ink-4 text-sm">
          No blocks found. Create blocks on the <a href="/blocks" className="text-green underline underline-offset-2">Blocks page</a> first.
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
        <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-ink">
          <Icon className={`h-4 w-4 ${colorClass}`} />
          {label}
        </label>
        <div className="flex items-center gap-1">
          <input type="number" value={value} min={min} max={max} step={step}
            onChange={e => onChange(parseFloat(e.target.value) || min)}
            className="w-16 text-right px-2 py-1 rounded-lg border border-line bg-surface text-sm text-ink focus:outline-none focus:ring-1 focus:ring-green" />
          <span className="text-xs text-ink-3 w-8">{unit}</span>
        </div>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ background: `linear-gradient(to right, var(--color-green) ${pct}%, #e2e8f0 ${pct}%)` }}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green [&::-webkit-slider-thumb]:shadow-sm" />
      <p className="text-xs text-ink-4">{description}</p>
    </div>
  )
}

type PushStatus = 'unknown' | 'subscribed' | 'unsubscribed' | 'denied' | 'unsupported'

function PushNotificationToggle({ farmId }: { farmId: string }) {
  const [status, setStatus] = useState<PushStatus>('unknown')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser capability check must run post-mount
      setStatus('unsupported'); return
    }
    if (Notification.permission === 'denied') {
      setStatus('denied'); return
    }
    let cancelled = false
    // Fallback: if SW isn't ready within 3 s (e.g. first install), show toggle as off
    const timeout = setTimeout(() => {
      if (!cancelled) setStatus('unsubscribed')
    }, 3000)
    navigator.serviceWorker.ready.then((reg) => {
      clearTimeout(timeout)
      if (cancelled) return
      reg.pushManager.getSubscription().then((sub) => {
        if (!cancelled) setStatus(sub ? 'subscribed' : 'unsubscribed')
      })
    })
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [])

  async function handleToggle() {
    setLoading(true)
    setMessage(null)
    try {
      if (status === 'subscribed') {
        const ok = await unsubscribeFromPush()
        setStatus(ok ? 'unsubscribed' : 'subscribed')
        if (ok) setMessage('Push notifications disabled on this device.')
      } else {
        const ok = await subscribeToPush(farmId)
        if (ok) {
          setStatus('subscribed')
          setMessage('Push notifications enabled! You will receive alerts on this device.')
        } else {
          if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
            setStatus('denied')
            setMessage('Permission blocked. Enable Notifications in your browser site settings, then refresh.')
          } else {
            setMessage('Could not enable push notifications. Try again.')
          }
        }
      }
    } catch {
      setMessage('An error occurred. Please try again.')
    }
    setLoading(false)
  }

  const isOn = status === 'subscribed'

  if (status === 'unsupported') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-line p-4">
        <Bell className="h-5 w-5 text-ink-4 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-ink-2">Push Notifications</p>
          <p className="text-xs text-ink-4 mt-1">Not supported in this browser. Use Chrome or Safari on iOS 16.4+.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-line p-5 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`rounded-lg p-2 ${isOn ? 'bg-green-soft' : 'bg-tile'}`}>
            <Bell className={`h-5 w-5 ${isOn ? 'text-green' : 'text-ink-4'}`} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Push Notifications</p>
            <p className="text-xs text-ink-3 mt-0.5">
              {status === 'denied'
                ? 'Permission blocked in browser settings'
                : isOn
                ? 'Enabled on this device'
                : status === 'unknown'
                ? 'Checking…'
                : 'Disabled on this device'}
            </p>
          </div>
        </div>
        <button
          onClick={handleToggle}
          disabled={loading || status === 'denied' || status === 'unknown'}
          aria-pressed={isOn}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green focus:ring-offset-2 disabled:opacity-50 ${
            isOn ? 'bg-green' : 'bg-line'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-surface shadow transition-transform ${isOn ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
      {status === 'denied' && (
        <p className="text-xs text-amber">
          Click the lock/info icon in your browser address bar, allow Notifications, then refresh.
        </p>
      )}
      {message && (
        <p className={`text-xs ${message.startsWith('Push notifications enabled') || message.startsWith('Push notifications disabled') ? 'text-green' : 'text-red'}`}>
          {message}
        </p>
      )}
      <p className="text-xs text-ink-4">
        Receive alerts for high-priority block issues and new AI recommendations when you&apos;re away from the app.
      </p>
    </div>
  )
}

function NotificationAlertsTab({ farmId }: { farmId: string }) {
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
        <PushNotificationToggle farmId={farmId} />
        <ThresholdSlider id="soil-moisture-low" label="Soil Moisture — Low Alert" description="Alert fires when a block's soil moisture reading falls below this level."
          icon={Droplets} colorClass="text-blue" value={prefs.soilMoistureLow} onChange={v => update('soilMoistureLow', v)} min={5} max={50} step={1} unit="%" />
        <ThresholdSlider id="water-deficit-high" label="Water Deficit — Critical" description="Alert fires when estimated water deficit exceeds this amount."
          icon={Droplets} colorClass="text-amber" value={prefs.waterDeficitHigh} onChange={v => update('waterDeficitHigh', v)} min={10} max={100} step={5} unit="mm" />
        <ThresholdSlider id="temp-heat-stress" label="Heat Stress Temperature" description="Alert fires when the forecast high exceeds this temperature."
          icon={Thermometer} colorClass="text-red" value={prefs.tempHeatStress} onChange={v => update('tempHeatStress', v)} min={28} max={48} step={1} unit="°C" />
        <ThresholdSlider id="rain-skip" label="Rainfall — Skip Irrigation" description="If forecast or recorded rainfall exceeds this, the AI will recommend skipping irrigation."
          icon={Wind} colorClass="text-teal" value={prefs.rainSkipIrrigation} onChange={v => update('rainSkipIrrigation', v)} min={2} max={30} step={1} unit="mm" />
        <ThresholdSlider id="pest-risk" label="Pest Risk — High Alert" description="Alert fires when AI pest risk score exceeds this confidence threshold."
          icon={AlertTriangle} colorClass="text-gold" value={prefs.pestRiskHigh} onChange={v => update('pestRiskHigh', v)} min={40} max={95} step={5} unit="%" />

        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleSave} className="flex items-center gap-2 rounded-xl bg-green px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-105 transition-all">
            {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? 'Saved!' : 'Save Thresholds'}
          </button>
          <button onClick={handleReset} className="flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink-2 hover:bg-tile transition-colors">
            <RefreshCw className="h-4 w-4" />
            Reset to Defaults
          </button>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-tile p-3">
          <Info className="h-4 w-4 text-ink-4 mt-0.5 shrink-0" />
          <p className="text-xs text-ink-3">
            Alert thresholds are currently stored in your browser. They will persist across page reloads but not across different devices or browsers.
          </p>
        </div>
      </div>
    </SectionCard>
  )
}

// ── Tab 5: Sensor Connections ─────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={handleCopy} className="p-1.5 rounded-lg hover:bg-tile transition-colors text-ink-4 hover:text-ink-2">
      {copied ? <Check className="h-3.5 w-3.5 text-green" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

const SENSOR_TYPE_OPTIONS: { value: SensorType; label: string }[] = [
  { value: 'soil_moisture', label: 'Soil Moisture' },
  { value: 'soil_ec',       label: 'Soil EC' },
  { value: 'soil_temp',     label: 'Soil Temperature' },
  { value: 'air_humidity',  label: 'Air Humidity' },
  { value: 'wind',          label: 'Wind Speed' },
  { value: 'rainfall',      label: 'Rainfall' },
  { value: 'multi',         label: 'Multi-Sensor' },
]

function StatusDot({ status }: { status: 'online' | 'offline' | 'unknown' }) {
  const cfg = {
    online:  { cls: 'bg-green', label: 'Online'  },
    offline: { cls: 'bg-amber', label: 'Offline' },
    unknown: { cls: 'bg-ink-4', label: 'Unknown' },
  }[status]
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${cfg.cls}`} />
      <span className="text-xs text-ink-3">{cfg.label}</span>
    </span>
  )
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const BLANK_FORM: SensorFormValues = {
  name: '', device_id: '', sensor_type: 'soil_moisture', block_id: null, location_notes: null,
}

function SensorConnectionsTab({
  initialSensors,
  blocks,
  farmId,
  initialSensecapApiId,
  initialSensecapAccessKey,
}: {
  initialSensors: SensorWithBlock[]
  blocks: Block[]
  farmId: string
  initialSensecapApiId?: string | null
  initialSensecapAccessKey?: string | null
}) {
  const [sensors, setSensors] = useState<SensorWithBlock[]>(initialSensors)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<SensorWithBlock | null>(null)
  const [form, setForm] = useState<SensorFormValues>(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [newApiKey, setNewApiKey] = useState<string | null>(null)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)

  // SenseCAP credentials state
  const [sensecapApiId, setSensecapApiId] = useState(initialSensecapApiId ?? '')
  const [sensecapAccessKey, setSensecapAccessKey] = useState(initialSensecapAccessKey ?? '')
  const [showAccessKey, setShowAccessKey] = useState(false)
  const [sensecapSaving, setSensecapSaving] = useState(false)
  const [sensecapTesting, setSensecapTesting] = useState(false)
  const [sensecapStatus, setSensecapStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  async function handleSaveSensecap() {
    setSensecapSaving(true)
    setSensecapStatus(null)
    const res = await saveSensecapCredentials(farmId, sensecapApiId.trim(), sensecapAccessKey.trim())
    setSensecapSaving(false)
    if (res.error) {
      setSensecapStatus({ type: 'error', message: res.error })
    } else {
      setSensecapStatus({ type: 'success', message: 'SenseCAP credentials saved.' })
    }
  }

  async function handleTestSensecap() {
    setSensecapTesting(true)
    setSensecapStatus(null)
    const res = await testSensecapConnection(sensecapApiId.trim(), sensecapAccessKey.trim())
    setSensecapTesting(false)
    if (res.error) {
      setSensecapStatus({ type: 'error', message: `Connection failed: ${res.error}` })
    } else {
      setSensecapStatus({ type: 'success', message: `Connected — Organisation ID: ${res.org_id}` })
    }
  }

  const webhookBase = typeof window !== 'undefined'
    ? `${window.location.origin}/api/ingest`
    : '/api/ingest'

  function openAdd() {
    setEditTarget(null)
    setForm(BLANK_FORM)
    setActionError(null)
    setModalOpen(true)
  }

  function openEdit(s: SensorWithBlock) {
    setEditTarget(s)
    setForm({ name: s.name, device_id: s.device_id, sensor_type: s.sensor_type, block_id: s.block_id, location_notes: s.location_notes })
    setActionError(null)
    setModalOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    setActionError(null)
    if (editTarget) {
      const res = await updateSensor(editTarget.id, farmId, form)
      if (res.error) { setActionError(res.error); setSaving(false); return }
      setSensors(prev => prev.map(s => s.id === editTarget.id
        ? { ...s, ...form, block_name: blocks.find(b => b.id === form.block_id)?.name ?? null }
        : s))
    } else {
      const res = await registerSensor(farmId, form)
      if (res.error) { setActionError(res.error); setSaving(false); return }
      if (res.sensor) {
        const withBlock: SensorWithBlock = {
          ...res.sensor,
          block_name: blocks.find(b => b.id === res.sensor!.block_id)?.name ?? null,
        }
        setSensors(prev => [withBlock, ...prev])
        setNewApiKey(res.sensor.api_key)
      }
    }
    setSaving(false)
    setModalOpen(false)
  }

  async function handleDelete(id: string) {
    const res = await deleteSensor(id, farmId)
    if (res.error) { setActionError(res.error); return }
    setSensors(prev => prev.filter(s => s.id !== id))
    setDeleteConfirm(null)
  }

  async function handleRegenerateKey(id: string) {
    setRegeneratingId(id)
    const res = await generateSensorApiKey(id, farmId)
    setRegeneratingId(null)
    if (res.error) { setActionError(res.error); return }
    if (res.api_key) setNewApiKey(res.api_key)
  }

  const INGEST_ENDPOINTS = [
    {
      path: '/soil',
      label: 'Soil Readings',
      payload: `{ "moisture": 28.5, "ec": 1.2, "temp": 22.4 }`,
    },
    {
      path: '/weather',
      label: 'Weather Snapshot',
      payload: `{ "temp_c": 34.0, "humidity_pct": 42, "rainfall_mm": 0, "wind_kmh": 18 }`,
    },
    {
      path: '/alert',
      label: 'Custom Alert',
      payload: `{ "block_id": "...", "domain": "soil-water", "severity": "warning", "message": "..." }`,
    },
  ]

  return (
    <div className="space-y-8">
      {/* SenseCAP Cloud Integration */}
      <SectionCard title="SenseCAP Cloud Integration" icon={Wifi}
        description="Connect your SenseCAP LoRaWAN/4G sensors. Telemetry is pulled 3× per day and written directly into the block state.">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1.5 uppercase tracking-wider">
                API ID
              </label>
              <input
                type="text"
                value={sensecapApiId}
                onChange={e => setSensecapApiId(e.target.value)}
                placeholder="e.g. 7D4A..."
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-green"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1.5 uppercase tracking-wider">
                Access Key
              </label>
              <div className="relative">
                <input
                  type={showAccessKey ? 'text' : 'password'}
                  value={sensecapAccessKey}
                  onChange={e => setSensecapAccessKey(e.target.value)}
                  placeholder="Access Key"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 pr-10 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-green"
                />
                <button
                  type="button"
                  onClick={() => setShowAccessKey(v => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-4 hover:text-ink-2"
                  tabIndex={-1}
                >
                  {showAccessKey ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <StatusBanner status={sensecapStatus} />

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSaveSensecap}
              disabled={sensecapSaving || !sensecapApiId.trim() || !sensecapAccessKey.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-green px-4 py-2 text-sm font-semibold text-white hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sensecapSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Credentials
            </button>
            <button
              onClick={handleTestSensecap}
              disabled={sensecapTesting || !sensecapApiId.trim() || !sensecapAccessKey.trim()}
              className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-2 hover:bg-tile disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sensecapTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Test Connection
            </button>
          </div>

          <p className="text-xs text-ink-4">
            Find your API credentials in the SenseCAP portal under Account → Access API. The Device EUI for each sensor is entered per-sensor below.
          </p>
        </div>
      </SectionCard>

      {/* One-time API key banner */}
      {newApiKey && (
        <div className="rounded-xl border border-green bg-green-soft p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-green mb-1">
                Copy this API key — it won&apos;t be shown in full again
              </p>
              <div className="flex items-center gap-2 rounded-lg bg-surface border border-green px-3 py-2">
                <code className="text-xs font-mono text-ink-2 break-all flex-1">{newApiKey}</code>
                <CopyButton text={newApiKey} />
              </div>
              <p className="text-xs text-green mt-1.5">
                Flash this key into your sensor firmware as the <code className="font-mono">X-Sensor-Key</code> header value.
              </p>
            </div>
            <button onClick={() => setNewApiKey(null)} className="text-green hover:text-green mt-0.5">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Sensor inventory */}
      <SectionCard title="Registered Sensors" icon={Cpu}
        description="Register each physical sensor device and assign it to a block. A block can have multiple sensors.">
        <div className="flex justify-end mb-4">
          <button onClick={openAdd}
            className="flex items-center gap-1.5 rounded-xl bg-green px-4 py-2 text-sm font-semibold text-white hover:brightness-105 transition-colors">
            <Plus className="h-4 w-4" />
            Add Sensor
          </button>
        </div>

        {actionError && (
          <div className="mb-4 rounded-lg bg-red-soft border border-red/25 p-3 text-sm text-red">
            {actionError}
          </div>
        )}

        {sensors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Cpu className="h-10 w-10 text-line mb-3" />
            <p className="text-sm font-medium text-ink-3">No sensors registered yet</p>
            <p className="text-xs text-ink-4 mt-1">Add a sensor above to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {['Name', 'Type', 'Block', 'Status', 'Last Seen', 'API Key', ''].map(h => (
                    <th key={h} className="pb-3 px-2 text-xs font-semibold text-ink-3 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-tile">
                {sensors.map(s => (
                  <tr key={s.id} className="group">
                    <td className="py-3 px-2">
                      <p className="font-medium text-ink">{s.name}</p>
                      <p className="text-xs text-ink-4 font-mono">{s.device_id}</p>
                    </td>
                    <td className="py-3 px-2 text-ink-2 whitespace-nowrap">
                      {SENSOR_TYPE_LABELS[s.sensor_type] ?? s.sensor_type}
                    </td>
                    <td className="py-3 px-2 text-ink-2">
                      {s.block_name ?? <span className="text-ink-4 italic">Unassigned</span>}
                    </td>
                    <td className="py-3 px-2">
                      <StatusDot status={s.status} />
                    </td>
                    <td className="py-3 px-2 text-ink-3 whitespace-nowrap text-xs">
                      {formatLastSeen(s.last_seen_at)}
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-1">
                        <code className="text-xs font-mono text-ink-3">
                          ···{s.api_key.slice(-8)}
                        </code>
                        <CopyButton text={s.api_key} />
                        <button
                          onClick={() => handleRegenerateKey(s.id)}
                          disabled={regeneratingId === s.id}
                          title="Regenerate key"
                          className="p-1.5 rounded-lg hover:bg-tile transition-colors text-ink-4 hover:text-ink-2 disabled:opacity-50">
                          <RotateCcw className={`h-3.5 w-3.5 ${regeneratingId === s.id ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(s)}
                          className="p-1.5 rounded-lg hover:bg-tile text-ink-4 hover:text-ink-2 transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {deleteConfirm === s.id ? (
                          <span className="flex items-center gap-1 text-xs">
                            <button onClick={() => handleDelete(s.id)}
                              className="px-2 py-0.5 rounded bg-red text-white text-xs hover:brightness-105">Confirm</button>
                            <button onClick={() => setDeleteConfirm(null)}
                              className="px-2 py-0.5 rounded bg-line text-ink-2 text-xs">Cancel</button>
                          </span>
                        ) : (
                          <button onClick={() => setDeleteConfirm(s.id)}
                            className="p-1.5 rounded-lg hover:bg-red-soft text-ink-4 hover:text-red transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Add / Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface shadow-xl ring-1 ring-line p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-ink">
                {editTarget ? 'Edit Sensor' : 'Add Sensor'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-ink-4 hover:text-ink-2">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink-2 mb-1">Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Block A — North Probe"
                  className="block w-full rounded-xl border-0 px-3 py-2.5 text-sm text-ink shadow-sm ring-1 ring-line placeholder:text-ink-4 focus:ring-2 focus:ring-green" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-2 mb-1">Device ID</label>
                <input value={form.device_id} onChange={e => setForm(f => ({ ...f, device_id: e.target.value }))}
                  placeholder="MAC address or serial number"
                  className="block w-full rounded-xl border-0 px-3 py-2.5 text-sm text-ink shadow-sm ring-1 ring-line placeholder:text-ink-4 focus:ring-2 focus:ring-green" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-2 mb-1">Sensor Type</label>
                <select value={form.sensor_type} onChange={e => setForm(f => ({ ...f, sensor_type: e.target.value as SensorType }))}
                  className="block w-full rounded-xl border-0 px-3 py-2.5 text-sm text-ink shadow-sm ring-1 ring-line focus:ring-2 focus:ring-green">
                  {SENSOR_TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-2 mb-1">Block Assignment</label>
                <select value={form.block_id ?? ''} onChange={e => setForm(f => ({ ...f, block_id: e.target.value || null }))}
                  className="block w-full rounded-xl border-0 px-3 py-2.5 text-sm text-ink shadow-sm ring-1 ring-line focus:ring-2 focus:ring-green">
                  <option value="">Unassigned</option>
                  {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-2 mb-1">Location Notes <span className="text-ink-4 font-normal">(optional)</span></label>
                <textarea value={form.location_notes ?? ''} onChange={e => setForm(f => ({ ...f, location_notes: e.target.value || null }))}
                  rows={2} placeholder="e.g. North corner, 30 cm depth"
                  className="block w-full rounded-xl border-0 px-3 py-2.5 text-sm text-ink shadow-sm ring-1 ring-line placeholder:text-ink-4 focus:ring-2 focus:ring-green resize-none" />
              </div>

              {actionError && (
                <p className="text-sm text-red">{actionError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setModalOpen(false)}
                  className="flex-1 rounded-xl border border-line py-2.5 text-sm font-semibold text-ink-2 hover:bg-tile transition-colors">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.device_id.trim()}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-green py-2.5 text-sm font-semibold text-white hover:brightness-105 transition-colors disabled:opacity-50">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editTarget ? 'Save Changes' : 'Register Sensor'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ingest reference */}
      <SectionCard title="Ingest Endpoints" icon={Wifi}
        description="When sensors arrive, flash the API key from above and configure the firmware to POST to these endpoints.">
        <div className="mb-3 rounded-lg bg-green-soft border border-green p-3 flex items-start gap-2">
          <Info className="h-4 w-4 text-green mt-0.5 shrink-0" />
          <p className="text-xs text-green">
            All requests must include the header <code className="font-mono font-semibold">X-Sensor-Key: &lt;api-key&gt;</code>. The block is determined automatically from the sensor&apos;s assignment.
          </p>
        </div>
        <div className="space-y-3">
          {INGEST_ENDPOINTS.map(ep => (
            <div key={ep.path} className="rounded-xl border border-line overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-tile border-b border-line">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-soft text-green">POST</span>
                  <code className="text-sm font-mono text-ink-2">{webhookBase}{ep.path}</code>
                </div>
                <CopyButton text={`${webhookBase}${ep.path}`} />
              </div>
              <div className="px-4 py-3">
                <p className="text-xs font-semibold text-ink-3 uppercase tracking-wider mb-1.5">{ep.label} — Example Payload</p>
                <code className="text-xs text-ink-2 font-mono">{ep.payload}</code>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

// ── Tab 6: Weather API ────────────────────────────────────────────────────────

function WeatherAPITab({ farmId, farmName: initialName = '', farmAddress: initialAddress = '', initialLat = null, initialLng = null }: {
  farmId?: string
  farmName?: string
  farmAddress?: string
  initialLat?: number | null
  initialLng?: number | null
}) {
  const [coords, setCoords] = useState({
    lat: initialLat != null ? String(initialLat) : '',
    lng: initialLng != null ? String(initialLng) : '',
  })
  const [gpsSaving, setGpsSaving] = useState(false)
  const [gpsStatus, setGpsStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'error' | null>(null)

  const [farmName, setFarmName] = useState(initialName)
  const [farmAddress, setFarmAddressState] = useState(initialAddress)
  const [farmSaving, setFarmSaving] = useState(false)
  const [farmStatus, setFarmStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const router = useRouter()
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDeleteFarm() {
    if (!farmId || deleteConfirmText.trim() !== initialName.trim()) return
    setDeleting(true)
    setDeleteError(null)
    const result = await deleteFarm(farmId)
    if (result.error) {
      setDeleting(false)
      setDeleteError(result.error)
      return
    }
    router.push('/farms')
  }

  async function handleFarmSave() {
    if (!farmId || !farmName.trim()) return
    setFarmSaving(true)
    setFarmStatus(null)
    const result = await updateFarm(farmId, { name: farmName.trim(), address: farmAddress.trim() || undefined })
    setFarmSaving(false)
    setFarmStatus(result.error
      ? { type: 'error', message: result.error }
      : { type: 'success', message: 'Farm profile updated.' }
    )
  }

  async function handleSave() {
    if (!farmId) return
    setGpsSaving(true)
    setGpsStatus(null)
    const parsedLat = coords.lat ? Math.round(parseFloat(coords.lat) * 10000) / 10000 : null
    const parsedLng = coords.lng ? Math.round(parseFloat(coords.lng) * 10000) / 10000 : null
    const result = await updateFarm(farmId, { gps_lat: parsedLat, gps_lng: parsedLng })
    setGpsSaving(false)
    setGpsStatus(result.error
      ? { type: 'error', message: result.error }
      : { type: 'success', message: 'GPS coordinates saved. Dashboard weather will update on next visit.' }
    )
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
      <SectionCard title="Farm Identity" icon={Building2}
        description="Update the name and address shown on the farm tab and throughout the app.">
        <div className="space-y-4 max-w-lg">
          <StatusBanner status={farmStatus} />
          <div>
            <label className="block text-xs font-semibold text-ink-3 uppercase tracking-wider mb-1.5">
              Farm name <span className="text-red">*</span>
            </label>
            <input
              type="text"
              value={farmName}
              onChange={e => setFarmName(e.target.value)}
              placeholder="e.g. Sunrise Almonds"
              className="w-full px-3 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-green transition"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-3 uppercase tracking-wider mb-1.5">
              Address / location
            </label>
            <input
              type="text"
              value={farmAddress}
              onChange={e => setFarmAddressState(e.target.value)}
              placeholder="e.g. Jericho, West Bank"
              className="w-full px-3 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-green transition"
            />
          </div>
          <button
            onClick={handleFarmSave}
            disabled={farmSaving || !farmName.trim()}
            className="flex items-center gap-2 rounded-xl bg-green px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {farmSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Farm Profile
          </button>
        </div>
      </SectionCard>
      <SectionCard title="Danger Zone" icon={Trash2}
        description="Permanently delete this farm, including all blocks, sensors, and history. This cannot be undone.">
        <div className="space-y-3 max-w-lg">
          {deleteError && (
            <div className="rounded-lg border border-red/30 bg-red/10 px-3 py-2 text-sm text-red">
              {deleteError}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-ink-3 uppercase tracking-wider mb-1.5">
              Type <span className="font-mono text-ink-2">{initialName}</span> to confirm deletion
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder={initialName}
              className="w-full px-3 py-2.5 rounded-lg border border-red/30 bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-red transition"
            />
          </div>
          <button
            onClick={handleDeleteFarm}
            disabled={deleting || deleteConfirmText.trim() !== initialName.trim()}
            className="flex items-center gap-2 rounded-xl bg-red px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete This Farm
          </button>
        </div>
      </SectionCard>
      <SectionCard title="Open-Meteo Weather" icon={Cloud}
        description="Open-Meteo is a free, open-source weather API used for the dashboard weather strip and 7-day forecast. No API key required.">
        <div className="space-y-6 max-w-lg">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-green-soft border border-green/25">
            <Wifi className="h-5 w-5 text-green shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green">Open-Meteo — Connected</p>
              <p className="text-xs text-green mt-0.5">Free tier · No API key · Updates every hour</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="lat" className="block text-xs font-semibold text-ink-3 uppercase tracking-wider mb-1.5">Latitude</label>
              <input id="lat" type="number" step="0.0001" value={coords.lat} onChange={e => { const v = e.target.value; const d = v.indexOf('.'); setCoords(c => ({ ...c, lat: d === -1 ? v : v.slice(0, d + 5) })); }}
                placeholder="e.g. 31.7683"
                className="w-full px-3 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-green transition" />
            </div>
            <div>
              <label htmlFor="lng" className="block text-xs font-semibold text-ink-3 uppercase tracking-wider mb-1.5">Longitude</label>
              <input id="lng" type="number" step="0.0001" value={coords.lng} onChange={e => { const v = e.target.value; const d = v.indexOf('.'); setCoords(c => ({ ...c, lng: d === -1 ? v : v.slice(0, d + 5) })); }}
                placeholder="e.g. 35.2137"
                className="w-full px-3 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-green transition" />
            </div>
          </div>
          <p className="text-xs text-ink-4 -mt-2">Enter your farm&apos;s GPS coordinates. Saved to the database — used by the Dashboard weather strip and all team members.</p>

          <StatusBanner status={gpsStatus} />

          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={gpsSaving} className="flex items-center gap-2 rounded-xl bg-green px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {gpsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Coordinates
            </button>
            <button onClick={handleTest} disabled={testing || !coords.lat || !coords.lng} className="flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink-2 hover:bg-tile transition-colors disabled:opacity-60">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Test Connection
            </button>
          </div>
          {testResult === 'ok' && (
            <div className="flex items-center gap-2 text-sm text-green">
              <Check className="h-4 w-4" /> Connection successful — Open-Meteo is reachable for these coordinates.
            </div>
          )}
          {testResult === 'error' && (
            <div className="flex items-center gap-2 text-sm text-red">
              <WifiOff className="h-4 w-4" /> Connection failed — check the coordinates and your internet connection.
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="AI Recommendation Engine" icon={Cpu}
        description="AI recommendations are generated via OpenRouter. Set your API key in environment variables to enable the Generate AI Insights button.">
        <div className="space-y-4 max-w-lg">
          <div>
            <label className="block text-xs font-semibold text-ink-3 uppercase tracking-wider mb-1.5">Model</label>
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-line bg-tile">
              <Cpu className="h-4 w-4 text-green shrink-0" />
              <span className="text-sm text-ink-2 font-mono">google/gemini-2.5-flash</span>
              <span className="ml-auto text-xs text-ink-4">via OpenRouter</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-3 uppercase tracking-wider mb-1.5">API Key</label>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-line bg-tile">
              {process.env.NEXT_PUBLIC_OPENROUTER_CONFIGURED === 'true' ? (
                <><Wifi className="h-4 w-4 text-green shrink-0" /><span className="text-xs text-green font-medium">OPENROUTER_API_KEY configured</span></>
              ) : (
                <><WifiOff className="h-4 w-4 text-ink-4 shrink-0" /><span className="text-xs text-ink-3">Set <code className="bg-tile px-1 rounded">OPENROUTER_API_KEY</code> in .env.local or your deployment environment</span></>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-tile p-3">
            <Info className="h-4 w-4 text-ink-4 mt-0.5 shrink-0" />
            <p className="text-xs text-ink-3">
              Get a free API key at <span className="font-medium text-ink-2">openrouter.ai</span>. The key is read server-side only and never exposed to the browser.
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

// ── Tab 7: Language ───────────────────────────────────────────────────────────

const LOCALE_OPTIONS = [
  { value: 'en', label: 'English', flag: '🇬🇧' },
  { value: 'ar', label: 'العربية', flag: '🇸🇦' },
  { value: 'tr', label: 'Türkçe', flag: '🇹🇷' },
]

function LanguageTab() {
  const t = useTranslations('settings.language')
  const currentLocale = useLocale()
  const [isPending, setIsPending] = useState(false)

  async function handleSelect(value: string) {
    if (value === currentLocale || isPending) return
    setIsPending(true)
    await setLocale(value)
    window.location.reload()
  }

  return (
    <SectionCard title={t('title')} description={t('description')} icon={Globe}>
      <div className="space-y-4 max-w-xs">
        <div className="flex items-start gap-2 rounded-lg bg-green-soft border border-green p-3">
          <Globe className="h-4 w-4 text-green mt-0.5 shrink-0" />
          <p className="text-xs text-green">{t('topNavHint')}</p>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {LOCALE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSelect(opt.value)}
              disabled={isPending}
              className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-sm text-start transition-all disabled:opacity-60 ${
                currentLocale === opt.value
                  ? 'border-green bg-green-soft text-green font-medium'
                  : 'border-line text-ink-2 hover:border-line'
              }`}
            >
              <span className="text-xl leading-none">{opt.flag}</span>
              <span>{opt.label}</span>
              {currentLocale === opt.value && <Check className="ms-auto h-4 w-4" />}
              {isPending && currentLocale !== opt.value && <Loader2 className="ms-auto h-3 w-3 animate-spin opacity-50" />}
            </button>
          ))}
        </div>
      </div>
    </SectionCard>
  )
}

// ─── Main SettingsForms component ─────────────────────────────────────────────

export default function SettingsForms({
  initialProfile,
  currentUserId,
  userRole = 'worker',
  allUsers = [],
  blocks = [],
  farmId,
  farmName,
  farmAddress,
  farmGpsLat,
  farmGpsLng,
  sensors = [],
  initialSensecapApiId = null,
  initialSensecapAccessKey = null,
}: SettingsFormsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('profile')

  const tabs: { id: TabId; label: string; icon: React.ElementType; show: boolean }[] = [
    { id: 'profile' as TabId,  label: 'Account & Security', icon: User,       show: true },
    { id: 'team'    as TabId,  label: 'Team',               icon: Users,      show: userRole === 'admin' || userRole === 'supervisor' },
    { id: 'blocks'  as TabId,  label: 'Block Config',        icon: Layers,     show: userRole === 'admin' || userRole === 'supervisor' },
    { id: 'alerts'  as TabId,  label: 'Alert Thresholds',   icon: Bell,       show: userRole === 'admin' || userRole === 'supervisor' },
    { id: 'sensors' as TabId,  label: 'Sensors',             icon: Cpu,        show: userRole === 'admin' },
    { id: 'weather' as TabId,  label: 'Weather & AI',        icon: Cloud,      show: userRole === 'admin' },
    { id: 'language' as TabId, label: 'Language',            icon: Globe,      show: true },
  ].filter(t => t.show)

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b border-line pb-px gap-1 scrollbar-hide">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold tracking-tight whitespace-nowrap border-b-2 transition-all -mb-px ${
                isActive
                  ? 'border-green text-green'
                  : 'border-transparent text-ink-3 hover:text-ink-2'
              }`}>
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'profile'  && <AccountTab initialProfile={initialProfile} />}
      {activeTab === 'team'     && <TeamTab userRole={userRole} currentUserId={currentUserId} allUsers={allUsers} farmId={farmId ?? ''} farmName={farmName} />}
      {activeTab === 'blocks'   && <BlockConfigTab blocks={blocks} />}
      {activeTab === 'alerts'   && <NotificationAlertsTab farmId={farmId ?? ''} />}
      {activeTab === 'sensors'  && <SensorConnectionsTab initialSensors={sensors} blocks={blocks} farmId={farmId ?? ''} initialSensecapApiId={initialSensecapApiId} initialSensecapAccessKey={initialSensecapAccessKey} />}
      {activeTab === 'weather'  && <WeatherAPITab farmId={farmId} farmName={farmName} farmAddress={farmAddress} initialLat={farmGpsLat} initialLng={farmGpsLng} />}
      {activeTab === 'language' && <LanguageTab />}
    </div>
  )
}
