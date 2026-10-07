// Kept apart from drafts.ts so the drawer (a client component) can import it
// without pulling in the server-side search and model code drafts.ts uses.

import type { AssistantDraft } from "./drafts";

/**
 * Drafts with the same category and title are one action on several blocks.
 * The drawer shows them as one card; accepting it books one entry per block.
 */
export function groupDrafts(drafts: AssistantDraft[]): { key: string; indexes: number[]; drafts: AssistantDraft[] }[] {
  const groups: { key: string; indexes: number[]; drafts: AssistantDraft[] }[] = [];
  drafts.forEach((d, i) => {
    const key = `${d.category}|${d.title.trim().toLowerCase()}`;
    const g = groups.find((x) => x.key === key);
    if (g) {
      g.indexes.push(i);
      g.drafts.push(d);
    } else groups.push({ key, indexes: [i], drafts: [d] });
  });
  return groups;
}
