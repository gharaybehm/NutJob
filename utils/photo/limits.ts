// Daily caps on photo cases sent to the model (Requirements.md, Photo cases).
// Counted from photo_cases rows of the last 24 hours, so a burst of parallel
// sends can overshoot by a few; that is accepted. A case over the cap is still
// saved with its photos; only the model step is skipped.

export const DAILY_USER_CAP = 15;
export const DAILY_FARM_CAP = 40;
export const LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** A case still 'pending' after this long is taken as failed (the server stopped mid-step). */
export const PENDING_STALE_MS = 3 * 60 * 1000;

export type LimitHit = "limit_user" | "limit_farm" | null;

/** `userCount` and `farmCount` are the cases already recorded in the window, before this one. */
export function limitHit(userCount: number, farmCount: number): LimitHit {
  if (userCount >= DAILY_USER_CAP) return "limit_user";
  if (farmCount >= DAILY_FARM_CAP) return "limit_farm";
  return null;
}
