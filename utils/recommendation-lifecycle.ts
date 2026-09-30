/**
 * Recommendation lifecycle: when a pending card stops counting as open, and
 * how a block's past recommendations and logged work are described to the AI.
 * Pure (no DB) so it is unit-testable.
 *
 * Expiry: a new batch supersedes the farm's still-pending cards by setting
 * their expires_at to the moment it was inserted (generate-recommendations.ts).
 * A card is also expired once its own 7-day expires_at passes. Expired cards
 * are kept (History shows them as expired, and the AI sees them) but are not
 * offered for action.
 */

/** Days of recommendations and logged work the AI is shown per block. */
export const HISTORY_DAYS = 30;
/** Per block, so a busy block cannot crowd the prompt. */
const MAX_RECS = 10;
const MAX_ACTIVITIES = 10;

export function isExpired(expiresAt: string | null | undefined, now: Date): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return !Number.isNaN(t) && t <= now.getTime();
}

/** PostgREST `.or()` filter for rows that have not expired. Pair with `.eq("status", "pending")`. */
export function notExpiredFilter(now: Date): string {
  return `expires_at.is.null,expires_at.gt."${now.toISOString()}"`;
}

export interface PastRecommendation {
  id: string;
  block_id: string | null;
  category: string;
  title: string;
  status: "pending" | "accepted" | "edited" | "skipped";
  created_at: string;
  acted_at: string | null;
  expires_at: string | null;
  manager_note: string | null;
  activity_log_id: string | null;
}

export interface LinkedEvent {
  start_date: string;
  completed_at: string | null;
}

export interface PastActivity {
  activity_type: string;
  title: string;
  performed_at: string;
}

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "?");
/** Titles come from the LLM or a person: keep each on one line so block sections stay intact. */
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

const SKIP_REASON_TEXT: Record<string, string> = {
  already_done: "manager says it was already done",
  disagree: "manager disagreed",
  no_resources: "manager had no resources (labour, equipment or material) for it",
};

/** One outcome phrase for a past recommendation, from the manager's point of view. */
export function describeOutcome(rec: PastRecommendation, event: LinkedEvent | undefined, now: Date): string {
  if (rec.status === "skipped") {
    const reason = rec.manager_note?.startsWith("skip_reason:") ? rec.manager_note.slice("skip_reason:".length) : null;
    const why = reason && SKIP_REASON_TEXT[reason] ? `: ${SKIP_REASON_TEXT[reason]}` : " (no reason given)";
    return `SKIPPED on ${day(rec.acted_at)}${why}`;
  }
  if (rec.status === "accepted" || rec.status === "edited") {
    const edited = rec.status === "edited" ? " (edited by the manager)" : "";
    if (rec.activity_log_id || event?.completed_at) {
      return `DONE${event?.completed_at ? ` on ${day(event.completed_at)}` : ""}${edited}`;
    }
    if (event) return `SCHEDULED for ${day(event.start_date)}, not yet logged as done${edited}`;
    return `ACCEPTED on ${day(rec.acted_at)}, not scheduled${edited}`;
  }
  return isExpired(rec.expires_at, now)
    ? "EXPIRED without action"
    : "NOT ACTED ON (still open from the last batch; this run replaces it)";
}

/**
 * The RECENT HISTORY lines for one block: what the engine suggested and what
 * became of it, then the work logged on the block, newest first.
 */
export function describeBlockHistory(
  recs: PastRecommendation[],
  events: ReadonlyMap<string, LinkedEvent>,
  activities: PastActivity[],
  now: Date,
): string[] {
  const lines = [`\n=== RECENT HISTORY (last ${HISTORY_DAYS} days) ===`];

  const recent = [...recs].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, MAX_RECS);
  if (recent.length === 0) {
    lines.push("Previous recommendations: none");
  } else {
    lines.push("Previous recommendations:");
    for (const r of recent) {
      const note = r.manager_note && !r.manager_note.startsWith("skip_reason:") ? ` | manager note: "${oneLine(r.manager_note)}"` : "";
      lines.push(`  - ${day(r.created_at)} [${r.category}] "${oneLine(r.title)}" -> ${describeOutcome(r, events.get(r.id), now)}${note}`);
    }
  }

  const done = [...activities].sort((a, b) => b.performed_at.localeCompare(a.performed_at)).slice(0, MAX_ACTIVITIES);
  if (done.length === 0) {
    lines.push("Work logged on this block: none");
  } else {
    lines.push("Work logged on this block:");
    for (const a of done) lines.push(`  - ${day(a.performed_at)} ${a.activity_type}: "${oneLine(a.title)}"`);
  }
  return lines;
}
