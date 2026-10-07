// Shapes shared by the field assistant's route, actions and drawer.
import type { ReferenceStatus } from "@/utils/generate-recommendations";

export type { ReferenceStatus };

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
    }
  | { type: "error"; code: "unavailable" | "limit_user" | "limit_farm" | "bad_request" | "forbidden" | "not_configured" };
