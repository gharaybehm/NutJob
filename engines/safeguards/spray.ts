/**
 * Spray and worker safeguards (CDSS spec §A10.3, SG-SPR-1 to SG-SPR-8).
 *
 * Fixed protective rules. The rules are platform code; every limit comes
 * from the product's label as entered in the farm's product library. No
 * default threshold is invented here: a product whose label value is
 * missing is blocked by the safeguard that needs it. These rules are never
 * tuned by the learning loop and cannot be switched off by a prompt.
 *
 *   SG-SPR-1  no spraying when forecast wind is above the label maximum
 *   SG-SPR-2  no spraying in calm inversion conditions (wind below the minimum)
 *   SG-SPR-3  no spraying if rain is forecast within the rainfast period
 *   SG-SPR-4  no spray whose pre-harvest interval runs past the planned harvest
 *   SG-SPR-5  no labour in a block during its re-entry interval
 *   SG-SPR-6  no product past its maximum applications per season
 *   SG-SPR-7  no product not registered for the crop in the operating country
 *   SG-SPR-8  no bee-toxic product while hives are present or during bloom
 */

import { windAt2m } from '../core/units'
import { addDays, daysBetween, type HourlyWeatherPoint } from '../decision/weather'

export interface ProductLabel {
  id: string
  name: string
  /** Pack ids of the pests, diseases or weeds the product is used against. */
  targets: string[]
  /** Mode-of-action group (FRAC, IRAC or HRAC code). */
  modeOfActionGroup: string | null
  /** Wind limits during application, m/s at 2 m. */
  maxWindMs: number | null
  minWindMs: number | null
  rainfastHours: number | null
  phiDays: number | null
  reiHours: number | null
  maxApplicationsPerSeason: number | null
  /** Null when not recorded. */
  beeToxic: boolean | null
  /** Registered for this crop in the farm's country; null when not recorded. */
  registered: boolean | null
  /** Label values entered and approved in the product library. */
  approved: boolean
}

export interface SprayApplication {
  /** Farm-local date and UTC time of the application. */
  date: string
  at: string
  /** The library product used; null when the entry does not name one. */
  productId: string | null
  /** The pack id of what it was applied against; null when not recorded. */
  targetId: string | null
}

export interface SprayContext {
  today: string
  /** Hourly weather including the forecast. */
  hours: HourlyWeatherPoint[]
  /** Days ahead to assess, today included. */
  horizonDays: number
  /** First and last local hour in which spraying can be done. */
  workingHours: [number, number]
  plannedHarvestDate: string | null
  /** Applications in the block this season. */
  applications: SprayApplication[]
  /** True or false when recorded for the block; null when not recorded. */
  hivesPresent: boolean | null
  /** True when the block is in a phase the pack protects bees in. */
  inBeePhase: boolean
}

export interface SafeguardFinding {
  safeguardId: string
  reason: string
}

export interface SprayDay {
  dayIndex: number
  date: string
  /** Working hours of the day in which every weather limit is met. */
  allowedHours: number[]
  /** Why the day is closed; empty when at least one hour is allowed. */
  vetoes: SafeguardFinding[]
}

export interface ProductCheck {
  productId: string
  name: string
  /** Findings that block the product on every day. */
  blocked: SafeguardFinding[]
  days: SprayDay[]
  /** Things that could not be checked, for the manager to confirm. */
  notes: string[]
  /** True when the product is not blocked and at least one day is open. */
  usable: boolean
}

const WIND_HEIGHT_M = 10

/** Checks one product against every spray safeguard for the coming days. */
export function checkProduct(label: ProductLabel, ctx: SprayContext): ProductCheck {
  const blocked: SafeguardFinding[] = []
  const notes: string[] = []
  const block = (safeguardId: string, reason: string) => blocked.push({ safeguardId, reason })

  if (!label.approved) block('LIBRARY', 'The label values of this product are not approved in the product library')

  // SG-SPR-7
  if (label.registered === null) block('SG-SPR-7', 'Registration for this crop in this country is not recorded')
  else if (!label.registered) block('SG-SPR-7', 'Not registered for this crop in this country')

  // SG-SPR-6
  if (label.maxApplicationsPerSeason === null) block('SG-SPR-6', 'The maximum applications per season is not recorded')
  else {
    const unnamed = ctx.applications.filter(a => a.productId === null).length
    const used = ctx.applications.filter(a => a.productId === label.id).length
    if (used >= label.maxApplicationsPerSeason) {
      block('SG-SPR-6', `Applied ${used} time(s) this season; the label maximum is ${label.maxApplicationsPerSeason}`)
    } else if (unnamed > 0) {
      block('SG-SPR-6', `${unnamed} spray entry(ies) this season do not name a library product, so the number of applications cannot be confirmed`)
    }
  }

  // SG-SPR-8
  if (label.beeToxic === null) block('SG-SPR-8', 'Bee toxicity is not recorded')
  else if (label.beeToxic && ctx.hivesPresent === true) block('SG-SPR-8', 'Bee-toxic product while hives are recorded in the block')
  else if (label.beeToxic && ctx.inBeePhase) block('SG-SPR-8', 'Bee-toxic product during a phase in which bees are protected')

  // Label values the day-by-day checks need.
  if (label.maxWindMs === null) block('SG-SPR-1', 'The maximum wind speed is not recorded')
  if (label.minWindMs === null) block('SG-SPR-2', 'The minimum wind speed (inversion limit) is not recorded')
  if (label.rainfastHours === null) block('SG-SPR-3', 'The rainfast period is not recorded')
  if (label.phiDays === null) block('SG-SPR-4', 'The pre-harvest interval is not recorded')
  else if (ctx.plannedHarvestDate === null) notes.push('No planned harvest date, so the pre-harvest interval could not be checked')

  const days: SprayDay[] = []
  const { maxWindMs, minWindMs, rainfastHours, phiDays } = label
  if (maxWindMs !== null && minWindMs !== null && rainfastHours !== null && phiDays !== null) {
    const ordered = [...ctx.hours].sort((a, b) => (a.localDate === b.localDate ? a.localHour - b.localHour : a.localDate.localeCompare(b.localDate)))
    for (let dayIndex = 0; dayIndex < ctx.horizonDays; dayIndex++) {
      const date = addDays(ctx.today, dayIndex)
      const allowedHours: number[] = []
      const reasons = new Map<string, string>()

      // SG-SPR-4: the whole day is closed when the interval would run past harvest.
      if (ctx.plannedHarvestDate !== null && daysBetween(date, ctx.plannedHarvestDate) < phiDays) {
        days.push({
          dayIndex,
          date,
          allowedHours,
          vetoes: [{ safeguardId: 'SG-SPR-4', reason: `Pre-harvest interval of ${phiDays} days runs past the planned harvest on ${ctx.plannedHarvestDate}` }],
        })
        continue
      }

      for (let i = 0; i < ordered.length; i++) {
        const h = ordered[i]
        if (h.localDate !== date || h.localHour < ctx.workingHours[0] || h.localHour > ctx.workingHours[1]) continue
        // Only hours still ahead can be sprayed in.
        if (!h.forecast) continue
        if (h.wind10mMs === null) {
          reasons.set('SG-SPR-1', 'No wind forecast')
          continue
        }
        const wind = windAt2m(h.wind10mMs, WIND_HEIGHT_M)
        if (wind > maxWindMs) {
          reasons.set('SG-SPR-1', `Forecast wind above ${maxWindMs} m/s`)
          continue
        }
        if (wind < minWindMs) {
          reasons.set('SG-SPR-2', `Forecast wind below ${minWindMs} m/s (inversion conditions)`)
          continue
        }
        const after = ordered.slice(i + 1, i + 1 + Math.ceil(rainfastHours))
        if (after.length < Math.ceil(rainfastHours)) {
          reasons.set('SG-SPR-3', 'The forecast does not cover the rainfast period')
          continue
        }
        if (after.some(a => (a.precipMm ?? 0) > 0) || (h.precipMm ?? 0) > 0) {
          reasons.set('SG-SPR-3', `Rain forecast within the rainfast period of ${rainfastHours} h`)
          continue
        }
        allowedHours.push(h.localHour)
      }

      if (allowedHours.length === 0 && reasons.size === 0) reasons.set('SG-SPR-1', 'No forecast working hours left in the day')
      days.push({
        dayIndex,
        date,
        allowedHours,
        vetoes: allowedHours.length > 0 ? [] : [...reasons.entries()].map(([safeguardId, reason]) => ({ safeguardId, reason })),
      })
    }
  }

  return { productId: label.id, name: label.name, blocked, days, notes, usable: blocked.length === 0 && days.some(d => d.allowedHours.length > 0) }
}

export interface ReentryStatus {
  /** UTC time until which labour must stay out of the block; null when no interval is active. */
  blockedUntil: string | null
  /** Recent applications whose re-entry interval could not be determined. */
  unknown: number
}

/** How far back an application with an unknown interval still counts as a possible restriction. */
const UNKNOWN_REI_LOOKBACK_HOURS = 72

/** SG-SPR-5: the re-entry interval in force in a block. */
export function reentryStatus(applications: SprayApplication[], labels: ProductLabel[], now: Date): ReentryStatus {
  const byId = new Map(labels.map(l => [l.id, l]))
  let until = -Infinity
  let unknown = 0
  for (const a of applications) {
    const at = Date.parse(a.at)
    if (Number.isNaN(at) || at > now.getTime()) continue
    const rei = a.productId ? byId.get(a.productId)?.reiHours ?? null : null
    if (rei === null) {
      if (now.getTime() - at <= UNKNOWN_REI_LOOKBACK_HOURS * 3_600_000) unknown++
      continue
    }
    until = Math.max(until, at + rei * 3_600_000)
  }
  return { blockedUntil: until > now.getTime() ? new Date(until).toISOString() : null, unknown }
}

/**
 * Resistance management: true when the last `maxConsecutive` applications
 * against a target all used this product's mode-of-action group, so another
 * use of the group would break the rotation.
 */
export function breaksRotation(label: ProductLabel, targetId: string, applications: SprayApplication[], labels: ProductLabel[], maxConsecutive: number): boolean {
  if (label.modeOfActionGroup === null || maxConsecutive < 1) return false
  const byId = new Map(labels.map(l => [l.id, l]))
  const recent = applications
    .filter(a => a.targetId === targetId)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, maxConsecutive)
  if (recent.length < maxConsecutive) return false
  return recent.every(a => a.productId !== null && byId.get(a.productId)?.modeOfActionGroup === label.modeOfActionGroup)
}
