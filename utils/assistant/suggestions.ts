// Suggested questions for an empty conversation, from fixed templates over the
// farm's open alerts and open recommendations. No model call.

import type { AssistantPins } from "./types";

export interface SuggestionAlert {
  blockId: string;
  blockName: string;
  domain: string;
  severity: string;
}

export interface SuggestionRecommendation {
  id: string;
  blockId: string | null;
  blockName: string | null;
  title: string;
}

/** A message key under assistant.suggest, its values, and what to pin when it is picked. */
export interface Suggestion {
  key: "alert" | "recommendation" | "lastIrrigation" | "frostWeek" | "scoutNow";
  values: Record<string, string>;
  pins: AssistantPins;
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, warning: 2, medium: 3, info: 4, low: 5 };

export function buildSuggestions(
  alerts: SuggestionAlert[],
  recommendations: SuggestionRecommendation[],
  pinnedBlock: { id: string; name: string } | null,
  max = 4
): Suggestion[] {
  const out: Suggestion[] = [];
  const sortedAlerts = [...alerts]
    .filter((a) => !pinnedBlock || a.blockId === pinnedBlock.id)
    .sort((a, b) => (SEVERITY_RANK[a.severity.toLowerCase()] ?? 9) - (SEVERITY_RANK[b.severity.toLowerCase()] ?? 9));

  // One per domain and block, most severe first.
  const seen = new Set<string>();
  for (const a of sortedAlerts) {
    const k = `${a.blockId}:${a.domain}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ key: "alert", values: { block: a.blockName, domain: a.domain }, pins: { blockId: a.blockId } });
    if (out.length >= 2) break;
  }

  for (const r of recommendations) {
    if (out.length >= 3) break;
    if (pinnedBlock && r.blockId !== pinnedBlock.id) continue;
    out.push({
      key: "recommendation",
      values: { title: r.title.slice(0, 80), block: r.blockName ?? "" },
      pins: { recommendationId: r.id, ...(r.blockId ? { blockId: r.blockId } : {}) },
    });
  }

  const block = pinnedBlock ?? null;
  const fillers: Suggestion[] = block
    ? [
        { key: "lastIrrigation", values: { block: block.name }, pins: { blockId: block.id } },
        { key: "frostWeek", values: { block: block.name }, pins: { blockId: block.id } },
        { key: "scoutNow", values: { block: block.name }, pins: { blockId: block.id } },
      ]
    : [];
  for (const f of fillers) {
    if (out.length >= max) break;
    out.push(f);
  }
  return out.slice(0, max);
}
