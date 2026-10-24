/**
 * A sensor's reading interval, read from its own data. The interval is set on
 * the device (in the SenseCAP portal), not in this application, so every check
 * that depends on it works out the interval from the readings: a probe that
 * reports every 15 minutes and one that reports 12 times a day are judged
 * each on its own interval.
 */

/** How often /api/cron/sensecap-sync pulls readings from SenseCAP, seconds. */
export const PULL_INTERVAL_S = 3600

/** The window sensor validation looks at (spec A10.1): the last six hours. */
const PROBE_WINDOW_MIN_S = 6 * 3600

/** Readings the stuck check needs (spec A10.1). */
const STUCK_READINGS = 12

/**
 * The usual time between readings, seconds: the median gap, so one outage or
 * one burst of readings does not change it. Null with fewer than two readings.
 */
export function typicalIntervalS(times: (string | Date)[]): number | null {
  const ms = times
    .map(t => (t instanceof Date ? t.getTime() : Date.parse(t)))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
  const gaps: number[] = []
  for (let i = 1; i < ms.length; i++) if (ms[i] > ms[i - 1]) gaps.push((ms[i] - ms[i - 1]) / 1000)
  if (gaps.length === 0) return null
  gaps.sort((a, b) => a - b)
  const mid = Math.floor(gaps.length / 2)
  return gaps.length % 2 === 1 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2
}

/**
 * Age past which the latest reading is stale: one missed reading is allowed,
 * plus the time until the next pull brings it in.
 */
export function staleAfterS(intervalS: number, pullS: number = PULL_INTERVAL_S): number {
  return 2 * intervalS + pullS
}

/**
 * How far back to read a probe for validation: six hours, or longer for a slow
 * probe, so the stuck check still sees twelve readings.
 */
export function probeWindowS(intervalS: number | null): number {
  return Math.max(PROBE_WINDOW_MIN_S, STUCK_READINGS * (intervalS ?? 0))
}
