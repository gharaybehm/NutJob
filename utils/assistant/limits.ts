// Daily question caps (Requirements.md, Field assistant: Limits). Counted from
// assistant_events 'question' rows in the last 24 hours, so a burst of
// parallel requests can overshoot by a few; that is accepted.

export const DAILY_USER_CAP = 30;
export const DAILY_FARM_CAP = 150;
export const LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Longest question accepted, in characters. */
export const MAX_QUESTION_CHARS = 2000;

/** Earlier turns of the thread given to the model as conversation. */
export const HISTORY_TURNS = 10;

/** Conversations with no activity for this long are deleted (retention). */
export const RETENTION_DAYS = 365;

export type LimitHit = "limit_user" | "limit_farm" | null;

export function limitHit(userCount: number, farmCount: number): LimitHit {
  if (userCount >= DAILY_USER_CAP) return "limit_user";
  if (farmCount >= DAILY_FARM_CAP) return "limit_farm";
  return null;
}
