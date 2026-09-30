// Client-safe half of data-freshness.ts (no server imports), so the Sidebar
// can use the thresholds.

/**
 * How old each input the recommendation engine relies on is, in minutes
 * (null = never received). Shown in the sidebar so a stale feed is visible
 * instead of silently feeding recommendations.
 */
export interface DataFreshness {
  sensorsMin: number | null;
  weatherMin: number | null;
  irrigationLogMin: number | null;
}

/** Past these ages a source is flagged as stale. */
export const STALE_AFTER_MIN = {
  sensors: 3 * 60,          // sensors report every 15 min
  weather: 6 * 60,          // forecast refreshes every 3 h
  irrigationLog: 7 * 24 * 60,
} as const;
