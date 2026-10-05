/**
 * Farm health for the platform admin: is the farm set up, are its scheduled
 * jobs producing data, and is anyone using it. Pure, so the rules are
 * unit-testable; the admin actions gather the signals.
 *
 * It reports counts and times only, never what a farm's people wrote: the
 * platform admin is not a member of the farm.
 */

/** How long each job may go without output before it counts as stale. */
export const STALE_AFTER_HOURS = {
  /** Runs every 3 hours: two missed runs plus a margin. */
  weather: 7,
  /** Runs once a day at 00:00 UTC. */
  computeFields: 36,
  /** Runs every 3 hours and writes one row per block per day. */
  dailySnapshot: 36,
  /** Runs weekly (Monday 04:00 UTC). */
  recommendations: 8 * 24,
} as const

/** No one logging anything or acting on advice for this long is worth a look. */
export const QUIET_AFTER_DAYS = 14

export type JobName = keyof typeof STALE_AFTER_HOURS

export const JOB_LABELS: Record<JobName, string> = {
  weather: 'Weather update',
  computeFields: 'Daily calculations',
  dailySnapshot: 'Daily snapshot',
  recommendations: 'AI recommendations',
}

export interface FarmSignals {
  hasLocation: boolean
  blocks: number
  /** Blocks with no field capacity, wilting point or root depth (own or farm default): irrigation advice is off for them. */
  blocksMissingSoil: number
  /** Blocks with no variety set. */
  blocksMissingVariety: number
  /** Blocks with no planting date. */
  blocksMissingPlantingDate: number
  /** When each job last produced data for this farm (ISO), or null if never. */
  lastRun: Record<JobName, string | null>
  /** `silent` counts sensors with no reading within the farm's sensor-failure window, or none ever. */
  sensors: { total: number; reporting: number; silent: number }
  openAlerts: { critical: number; warning: number; info: number }
  pendingRecommendations: number
  /** The last time someone logged work or acted on a recommendation (ISO), or null. */
  lastActivity: string | null
  /** Crops or varieties grown here with no guides loaded. */
  knowledgeGaps: number
}

export type HealthLevel = 'stalled' | 'attention' | 'healthy' | 'not_set_up'

export interface HealthIssue {
  level: 'stalled' | 'attention'
  message: string
}

export interface JobState {
  job: JobName
  lastRun: string | null
  /** Hours since the last output, or null if there has never been any. */
  ageHours: number | null
  stale: boolean
}

export interface FarmHealth {
  level: HealthLevel
  issues: HealthIssue[]
  jobs: JobState[]
}

const HOUR_MS = 3_600_000

function hoursSince(iso: string | null, now: Date): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : Math.max(0, (now.getTime() - t) / HOUR_MS)
}

/** "3 h ago", "2 d ago", or "never". */
export function describeAge(iso: string | null, now: Date): string {
  const hours = hoursSince(iso, now)
  if (hours === null) return 'never'
  if (hours < 1) return 'under 1 h ago'
  if (hours < 48) return `${Math.floor(hours)} h ago`
  return `${Math.floor(hours / 24)} d ago`
}

export function assessFarmHealth(s: FarmSignals, now: Date): FarmHealth {
  const jobs: JobState[] = (Object.keys(STALE_AFTER_HOURS) as JobName[]).map(job => {
    const ageHours = hoursSince(s.lastRun[job], now)
    return { job, lastRun: s.lastRun[job], ageHours, stale: ageHours === null || ageHours > STALE_AFTER_HOURS[job] }
  })

  // Nothing can run for a farm with no blocks: it is not stalled, it has not started.
  if (s.blocks === 0) {
    return { level: 'not_set_up', issues: [{ level: 'attention', message: 'No blocks have been created.' }], jobs }
  }

  const issues: HealthIssue[] = []
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

  if (!s.hasLocation) {
    // The weather and calculation jobs skip a farm with no coordinates, so their silence is expected.
    issues.push({ level: 'attention', message: 'No GPS location is set, so weather and the daily calculations do not run.' })
  }
  for (const j of jobs) {
    if (!j.stale) continue
    const needsLocation = j.job === 'weather' || j.job === 'computeFields'
    if (needsLocation && !s.hasLocation) continue
    const when = j.ageHours === null ? 'has never produced data' : `last produced data ${describeAge(j.lastRun, now)}`
    // A weekly AI run that returns nothing leaves no trace, so its silence is a prompt to look, not a failure.
    issues.push({ level: j.job === 'recommendations' ? 'attention' : 'stalled', message: `${JOB_LABELS[j.job]} ${when}.` })
  }

  if (s.openAlerts.critical > 0) issues.push({ level: 'attention', message: `${plural(s.openAlerts.critical, 'critical alert')} unresolved.` })
  if (s.sensors.silent > 0) issues.push({ level: 'attention', message: `${plural(s.sensors.silent, 'sensor')} of ${s.sensors.total} not reporting.` })
  if (s.blocksMissingSoil > 0) {
    issues.push({ level: 'attention', message: `${plural(s.blocksMissingSoil, 'block')} of ${s.blocks} missing field capacity, wilting point or root depth: irrigation advice is off for them.` })
  }
  if (s.blocksMissingVariety > 0) issues.push({ level: 'attention', message: `${plural(s.blocksMissingVariety, 'block')} with no variety set.` })
  if (s.knowledgeGaps > 0) {
    issues.push({ level: 'attention', message: `${s.knowledgeGaps} ${s.knowledgeGaps === 1 ? 'crop or variety' : 'crops or varieties'} with no guides loaded.` })
  }

  const quietHours = hoursSince(s.lastActivity, now)
  if (quietHours === null) issues.push({ level: 'attention', message: 'Nobody has logged work or acted on a recommendation yet.' })
  else if (quietHours > QUIET_AFTER_DAYS * 24) issues.push({ level: 'attention', message: `No work logged or recommendation acted on since ${describeAge(s.lastActivity, now)}.` })

  const level: HealthLevel = issues.some(i => i.level === 'stalled') ? 'stalled' : issues.length > 0 ? 'attention' : 'healthy'
  return { level, issues, jobs }
}

/** A recommendation, reduced to what the summary counts. */
export interface RecommendationFacts {
  status: 'pending' | 'accepted' | 'edited' | 'skipped'
  expired: boolean
  /** The skip reason code when one was given. */
  skipReason: string | null
  sourceBacked: boolean
  referenceStatus: string | null
}

export interface RecommendationSummary {
  total: number
  accepted: number
  skipped: number
  expired: number
  open: number
  skipReasons: Record<string, number>
  notSourceBacked: number
  /** Of those not source-backed, how many because nothing was loaded for the crop or the lookup failed. */
  noGuidesLoaded: number
  lookupFailed: number
}

export function summarizeRecommendations(recs: RecommendationFacts[]): RecommendationSummary {
  const out: RecommendationSummary = {
    total: recs.length, accepted: 0, skipped: 0, expired: 0, open: 0,
    skipReasons: {}, notSourceBacked: 0, noGuidesLoaded: 0, lookupFailed: 0,
  }
  for (const r of recs) {
    if (r.status === 'accepted' || r.status === 'edited') out.accepted += 1
    else if (r.status === 'skipped') {
      out.skipped += 1
      const reason = r.skipReason ?? 'no_reason'
      out.skipReasons[reason] = (out.skipReasons[reason] ?? 0) + 1
    } else if (r.expired) out.expired += 1
    else out.open += 1

    if (!r.sourceBacked) {
      out.notSourceBacked += 1
      if (r.referenceStatus === 'none_loaded') out.noGuidesLoaded += 1
      if (r.referenceStatus === 'error') out.lookupFailed += 1
    }
  }
  return out
}
