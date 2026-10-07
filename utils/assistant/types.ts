// Shapes shared by the field assistant's route, actions and drawer.
import type { ReferenceStatus } from "@/utils/generate-recommendations";
import type { AssistantDraft, DraftState } from "./drafts";

export type { ReferenceStatus, AssistantDraft, DraftState };

/** Guides can be requested for an answer that had no source and was about one crop. */
export function canRequestGuidesFor(referenceStatus: ReferenceStatus | null, searchScope: unknown): boolean {
  return searchScope != null && (referenceStatus === "none_loaded" || referenceStatus === "no_match");
}

/** What a conversation is about. Every id is checked against the farm on the server. */
export interface AssistantPins {
  blockId?: string;
  /** YYYY-MM-DD */
  from?: string;
  /** YYYY-MM-DD */
  to?: string;
  recommendationId?: string;
}

/** A knowledge-base passage the answer cites, numbered as it was given to the model. */
export interface AssistantCitation {
  n: number;
  title: string;
  section: string | null;
  page: number | null;
  origin: string;
}

/** A farm record supplied to the model, so the drawer can say what the answer drew on. */
export interface AssistantRecordRef {
  kind: "block" | "activity" | "calendar" | "recommendation" | "snapshot";
  label: string;
}

export type DeclineCategory =
  | "veterinary"
  | "medical"
  | "legal"
  | "financial"
  | "circumvention"
  | "pesticide_no_regulatory"
  | "off_topic";

export const DECLINE_CATEGORIES: readonly DeclineCategory[] = [
  "veterinary", "medical", "legal", "financial", "circumvention", "pesticide_no_regulatory", "off_topic",
];

export type AssistantMessageKind = "answer" | "decline" | "limit" | "error";

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  kind: AssistantMessageKind;
  citations: AssistantCitation[];
  referenceStatus: ReferenceStatus | null;
  recordRefs: AssistantRecordRef[];
  /** Draft recommendation cards, validated by the server. */
  drafts: AssistantDraft[];
  /** What became of each draft, keyed by its index. */
  draftStates: Record<string, DraftState>;
  /** The answer had no source and its guides were searched for one crop: guides can be requested. */
  canRequestGuides: boolean;
  createdAt: string;
}

export interface AssistantThreadSummary {
  id: string;
  title: string;
  lastActivityAt: string;
  /** Set only on a farm admin's view of someone else's conversation. */
  ownerName?: string;
  mine: boolean;
}

/** Server-sent events from the assistant route, one JSON object per `data:` line. */
export type AssistantStreamEvent =
  | { type: "meta"; threadId: string }
  | { type: "delta"; text: string }
  | { type: "replace"; text: string }
  | {
      type: "done";
      messageId: string | null;
      kind: AssistantMessageKind;
      citations: AssistantCitation[];
      referenceStatus: ReferenceStatus | null;
      recordRefs: AssistantRecordRef[];
      drafts: AssistantDraft[];
      canRequestGuides: boolean;
    }
  | { type: "error"; code: "unavailable" | "limit_user" | "limit_farm" | "bad_request" | "forbidden" | "not_configured" };
