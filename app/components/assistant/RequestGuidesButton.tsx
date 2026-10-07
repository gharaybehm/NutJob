"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Send } from "lucide-react";
import { requestGuidesFromAssistant } from "@/app/actions/assistant-drafts";

/**
 * "Request guides" under an answer with no source. Sending shares the question
 * with the platform team, so the button first says so and asks to confirm.
 */
export default function RequestGuidesButton({
  farmId, messageId, sent, canAct, onSent,
}: {
  farmId: string;
  messageId: string;
  sent: boolean;
  canAct: boolean;
  onSent: (kind: "gap" | "question") => void;
}) {
  const t = useTranslations("assistant.guides");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-green">
        <Check className="h-3.5 w-3.5" />
        {t("sent")}
      </p>
    );
  }
  if (!canAct) return null;

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await requestGuidesFromAssistant(farmId, messageId);
      if (res.ok && res.kind) onSent(res.kind);
      else setError(res.code === "limit" ? t("limit") : res.code === "already" ? t("sent") : (res.error ?? t("failed")));
    } catch {
      setError(t("failed"));
    }
    setBusy(false);
  }

  return (
    <div className="mt-2">
      {!confirming ? (
        <button type="button" onClick={() => setConfirming(true)} className="text-xs font-semibold text-green hover:underline">
          {t("request")}
        </button>
      ) : (
        <div className="rounded-lg border border-line bg-surface p-2.5">
          <p className="text-xs text-ink-2">{t("explain")}</p>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirming(false)} disabled={busy}
              className="rounded-lg px-2.5 py-1 text-xs text-ink-3 hover:bg-tile disabled:opacity-50">
              {t("cancel")}
            </button>
            <button type="button" onClick={send} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60">
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              {t("send")}
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-1.5 text-xs text-red">{error}</p>}
    </div>
  );
}
