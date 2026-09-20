/**
 * Sensor data quality layer (plan §8). Pure: takes a series of readings and
 * returns a flag per reading plus an overall sensor health. Engines must only
 * use readings whose flag is 'ok' or 'jump' (a jump is suspicious, not proof
 * of a bad reading, since irrigation and rain move soil moisture quickly).
 */

export type QualityFlag = 'ok' | 'out_of_range' | 'duplicate' | 'jump' | 'stuck'
export type SensorHealth = 'ok' | 'suspect' | 'failed'

export interface RawReading {
  at: string // ISO timestamp
  value: number
}

export interface QualityRules {
  min: number
  max: number
  /** Largest plausible change per hour between consecutive readings. */
  maxJumpPerHour: number
  /** This many identical consecutive readings marks the sensor as stuck. */
  stuckCount: number
  /** No reading for this long means the sensor has failed. */
  failedAfterHours: number
}

export const SOIL_MOISTURE_RULES: QualityRules = {
  min: 0,
  max: 65,
  maxJumpPerHour: 12,
  stuckCount: 12,
  failedAfterHours: 24,
}

export interface CheckedReading extends RawReading {
  flag: QualityFlag
}

export interface SeriesQuality {
  readings: CheckedReading[]
  health: SensorHealth
  reasons: string[]
}

export function usableReadings(q: SeriesQuality): CheckedReading[] {
  return q.readings.filter(r => r.flag === 'ok' || r.flag === 'jump')
}

export function checkSeries(
  input: RawReading[],
  rules: QualityRules,
  now: Date = new Date(),
): SeriesQuality {
  const sorted = [...input].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const readings: CheckedReading[] = []
  const reasons: string[] = []
  let prev: CheckedReading | null = null
  let run = 1

  for (const r of sorted) {
    let flag: QualityFlag = 'ok'
    if (!Number.isFinite(r.value) || r.value < rules.min || r.value > rules.max) {
      flag = 'out_of_range'
    } else if (prev && prev.at === r.at) {
      flag = 'duplicate'
    } else if (prev && prev.flag !== 'out_of_range') {
      const hours = Math.max((Date.parse(r.at) - Date.parse(prev.at)) / 3_600_000, 0.25)
      if (Math.abs(r.value - prev.value) / hours > rules.maxJumpPerHour) flag = 'jump'
    }
    const checked: CheckedReading = { ...r, flag }
    readings.push(checked)
    if (flag !== 'duplicate' && flag !== 'out_of_range') {
      run = prev && prev.value === r.value ? run + 1 : 1
      if (run >= rules.stuckCount) checked.flag = 'stuck'
      prev = checked
    }
  }

  const valid = readings.filter(r => r.flag !== 'duplicate')
  const last = valid[valid.length - 1]
  let health: SensorHealth = 'ok'

  if (!last) {
    health = 'failed'
    reasons.push('No readings received')
  } else {
    const hoursSince = (now.getTime() - Date.parse(last.at)) / 3_600_000
    if (hoursSince > rules.failedAfterHours) {
      health = 'failed'
      reasons.push(`No reading for ${Math.round(hoursSince)} h`)
    }
  }

  const recent = valid.slice(-rules.stuckCount)
  const badRecent = recent.filter(r => r.flag === 'out_of_range').length
  if (health !== 'failed' && recent.length > 0 && badRecent / recent.length > 0.5) {
    health = 'failed'
    reasons.push('Most recent readings are out of range')
  }
  if (health === 'ok' && valid.some(r => r.flag === 'stuck')) {
    health = 'suspect'
    reasons.push('Value has not changed across many readings')
  }
  if (health === 'ok' && valid.slice(-rules.stuckCount).some(r => r.flag === 'jump')) {
    health = 'suspect'
    reasons.push('Implausible jump in recent readings')
  }

  return { readings, health, reasons }
}
