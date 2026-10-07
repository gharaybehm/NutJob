"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LifeBuoy, Loader2 } from "lucide-react";
import { getShareStatus, shareWithSupport, withdrawShare, type ShareStatus } from "@/app/actions/assistant-share";

/**
 * Lets the person who asked share this one conversation with RootLoot support
 * for a limited time, or withdraw it. The explanation is shown before sharing.
 */
export default function ShareWithSupport({ farmId, threadId, online }: { farmId: string; threadId: string; online: boolean }) {
  const t = useTranslations("assistant.share");
  const [share, setShare] = useState<ShareStatus | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getShareStatus(farmId, threadId).then((s) => {
      if (!cancelled) setShare(s);
    });
    return () => {
      cancelled = true;
    };
  }, [farmId, threadId]);

  async function doShare() {
    setBusy(true);
    setError(null);
    const res = await shareWithSupport(farmId, threadId).catch(() => ({ error: "failed", share: undefined }));
    if (res.share) {
      setShare(res.share);
      setConfirming(false);
    } else setError(t("failed"));
    setBusy(false);
  }

  async function doWithdraw() {
    setBusy(true);
    setError(null);
    const res = await withdrawShare(farmId, threadId).catch(() => ({ error: "failed", ok: undefined }));
    if (res.ok) setShare(null);
    else setError(t("failed"));
    setBusy(false);
  }

  if (share === undefined) return null;

  return (
    <div className="border-b border-line-soft px-3 py-2 text-xs">
      {share ? (
        <div className="flex flex-wrap items-center text-ink-2">
          <LifeBuoy className="me-1.5 h-3.5 w-3.5 shrink-0 text-green" aria-hidden="true" />
          <span className="me-2">{t("active", { date: new Date(share.expiresAt).toLocaleDateString() })}</span>
          <button type="button" onClick={doWithdraw} disabled={busy || !online} className="font-semibold text-green hover:underline disabled:opacity-50">
            {t("withdraw")}
          </button>
        </div>
      ) : !confirming ? (
        <button type="button" onClick={() => setConfirming(true)} disabled={!online}
          className="inline-flex items-center gap-1.5 text-ink-3 hover:text-ink disabled:opacity-50">
          <LifeBuoy className="h-3.5 w-3.5" aria-hidden="true" />
          {t("button")}
        </button>
      ) : (
        <div className="rounded-lg border border-line bg-surface p-2.5">
          <p className="text-ink-2">{t("explain")}</p>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="rounded-lg px-2.5 py-1 text-ink-3 hover:bg-tile">
              {t("cancel")}
            </button>
            <button type="button" onClick={doShare} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green px-2.5 py-1 font-semibold text-white disabled:opacity-60">
              {busy && <Loader2 className="h-3 w-3 animate-spin" />}
              {t("confirm")}
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-red">{error}</p>}
    </div>
  );
}
