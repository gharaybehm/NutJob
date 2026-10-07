// The platform operator's view of the field assistant: counts only, never
// text (Requirements.md, Field assistant: Privacy). Built from
// assistant_events, which holds a kind, a category and a time and nothing else.
// Counts across farms are shown only when at least MIN_FARMS_FOR_TOTALS farms
// contribute, so a total cannot be read back to one farm.

export const MIN_FARMS_FOR_TOTALS = 5;
export const COUNT_WINDOW_DAYS = 30;

export interface AssistantCounts {
  questions: number;
  /** Advice answers with no source. */
  unsourced: number;
  declines: number;
  declinesByCategory: Record<string, number>;
  draftsAccepted: number;
  draftsDismissed: number;
  guidesRequested: number;
  retries: number;
  fallbacks: number;
  errors: number;
  sharesCreated: number;
  shareViews: number;
}

export function emptyCounts(): AssistantCounts {
  return {
    questions: 0, unsourced: 0, declines: 0, declinesByCategory: {}, draftsAccepted: 0, draftsDismissed: 0,
    guidesRequested: 0, retries: 0, fallbacks: 0, errors: 0, sharesCreated: 0, shareViews: 0,
  };
}

const FIELD: Record<string, keyof Omit<AssistantCounts, "declinesByCategory">> = {
  question: "questions",
  unsourced: "unsourced",
  decline: "declines",
  draft_accepted: "draftsAccepted",
  draft_dismissed: "draftsDismissed",
  guides_requested: "guidesRequested",
  retry: "retries",
  fallback: "fallbacks",
  error: "errors",
  share_created: "sharesCreated",
  share_viewed: "shareViews",
};

export function countEvents(events: { kind: string; category: string | null }[]): AssistantCounts {
  const c = emptyCounts();
  for (const e of events) {
    const field = FIELD[e.kind];
    if (!field) continue;
    c[field] += 1;
    if (e.kind === "decline") {
      const cat = e.category ?? "unknown";
      c.declinesByCategory[cat] = (c.declinesByCategory[cat] ?? 0) + 1;
    }
  }
  return c;
}

/** Per farm, from rows that carry a farm id. */
export function countByFarm(events: { farm_id: string; kind: string; category: string | null }[]): Map<string, AssistantCounts> {
  const byFarm = new Map<string, { kind: string; category: string | null }[]>();
  for (const e of events) {
    const list = byFarm.get(e.farm_id) ?? [];
    list.push(e);
    byFarm.set(e.farm_id, list);
  }
  return new Map([...byFarm].map(([farm, list]) => [farm, countEvents(list)]));
}

/**
 * Totals across farms, or null with the number of contributing farms when
 * fewer than MIN_FARMS_FOR_TOTALS asked anything. A farm contributes when it
 * asked at least one question in the window.
 */
export function crossFarmTotals(
  perFarm: Map<string, AssistantCounts>
): { totals: AssistantCounts | null; contributingFarms: number } {
  const contributing = [...perFarm.values()].filter((c) => c.questions > 0);
  if (contributing.length < MIN_FARMS_FOR_TOTALS) return { totals: null, contributingFarms: contributing.length };
  const t = emptyCounts();
  for (const c of contributing) {
    for (const k of Object.keys(t) as (keyof AssistantCounts)[]) {
      if (k === "declinesByCategory") {
        for (const [cat, n] of Object.entries(c.declinesByCategory)) t.declinesByCategory[cat] = (t.declinesByCategory[cat] ?? 0) + n;
      } else {
        t[k] += c[k];
      }
    }
  }
  return { totals: t, contributingFarms: contributing.length };
}
