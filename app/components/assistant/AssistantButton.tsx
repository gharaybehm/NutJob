"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAssistant } from "./AssistantProvider";
import type { AssistantPins } from "@/utils/assistant/types";

/** Top-bar control. Renders nothing outside the provider (workers). */
export function AssistantNavButton() {
  const assistant = useAssistant();
  const t = useTranslations("assistant");
  if (!assistant) return null;
  return (
    <button
      type="button"
      onClick={() => assistant.open()}
      aria-label={t("open")}
      title={t("open")}
      className="relative h-10 w-10 flex items-center justify-center rounded-[11px] border border-line bg-tile-2 text-ink-2 hover:bg-tile transition-colors"
    >
      <Sparkles className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

/** "Ask the assistant" on a block or a recommendation card, pinning it. */
export function AskAssistantButton({ pins, className = "" }: { pins: AssistantPins; className?: string }) {
  const assistant = useAssistant();
  const t = useTranslations("assistant");
  if (!assistant) return null;
  return (
    <button
      type="button"
      onClick={() => assistant.open(pins)}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-line bg-tile-2 px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:bg-tile transition-colors ${className}`}
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      {t("ask")}
    </button>
  );
}
