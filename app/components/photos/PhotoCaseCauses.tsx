"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, RefreshCw, Search } from "lucide-react";
import { confirmPhotoCase, rerunPhotoCase, type PhotoCaseCauses as Causes } from "@/app/actions/photo-cases";
import { CONFIRMED_HEALTHY, MAX_CONFIRMED_CHARS } from "@/utils/photo/case";

/**
 * Possible causes of one photo case, for supervisors and admins. They are
 * possibilities read from the photos, most likely first, with no confidence
 * figure and no product or dose; the user records what it really was.
 */
export default function PhotoCaseCauses({
  blockId,
  caseId,
  causes,
  onChanged,
}: {
  blockId: string;
  caseId: string;
  /** null when the model was never asked about this case. */
  causes: Causes | null;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations("photos.causes");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [other, setOther] = useState("");

  const status = causes?.status ?? "off";
  const reason = causes?.reason ?? "not_run";
  const confirmed = causes?.confirmedCause ?? null;
  const usable = causes?.photos.some((p) => p.usable) ?? false;

  async function rerun() {
    setBusy(true);
    setError(null);
    try {
      const res = await rerunPhotoCase(blockId, caseId);
      if (!res.ok) setError(t(`rerunErrors.${res.error}`));
    } catch {
      setError(t("rerunErrors.failed"));
    }
    await onChanged();
    setBusy(false);
  }

  async function confirm(cause: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await confirmPhotoCase(blockId, caseId, cause);
      if (res.ok) {
        setEditing(false);
        setOther("");
      } else setError(t("confirm.failed"));
    } catch {
      setError(t("confirm.failed"));
    }
    await onChanged();
    setBusy(false);
  }

  const offReason = reason === "disabled" || reason === "limit_user" || reason === "limit_farm" ? reason : "not_run";
  const canRerun = status === "failed" || (status === "off" && reason !== "disabled");

  return (
    <div className="mt-3 rounded-lg bg-paper-2 p-3">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-3">
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        {t("title")}
      </h4>

      {status === "pending" ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-ink-3">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t("pending")}
        </p>
      ) : status === "failed" ? (
        <p className="mt-2 text-sm text-amber-ink">{t("failed")}</p>
      ) : status === "off" ? (
        <p className="mt-2 text-sm text-ink-3">{t(`off.${offReason}`)}</p>
      ) : !usable ? (
        <div className="mt-2 text-sm text-amber-ink">
          <p>{t("notClear")}</p>
          <ul className="mt-1 list-disc ps-5 text-xs">
            {causes!.photos.map((p, i) => (p.usable || !p.problem ? null : <li key={i}>{t("photoProblem", { n: i + 1, problem: p.problem })}</li>))}
          </ul>
        </div>
      ) : causes!.causes.length === 0 ? (
        <p className="mt-2 text-sm text-ink-2">{causes!.healthy === true ? t("healthy") : t("none")}</p>
      ) : (
        <>
          <ol className="mt-2 space-y-2">
            {causes!.causes.map((c, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-tile text-xs font-semibold text-ink-2">{i + 1}</span>
                <span>
                  <span className="font-medium text-ink">{c.name}</span>
                  {c.signs && <span className="block text-xs text-ink-3">{c.signs}</span>}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-ink-3">{t("caution")}</p>
        </>
      )}

      {canRerun && (
        <button
          type="button"
          onClick={() => void rerun()}
          disabled={busy}
          className="mt-2 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-ink-2 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          {busy ? t("rerunning") : t("rerun")}
        </button>
      )}

      {/* What it really was: the farm's own record, and the check on the model. */}
      {status !== "pending" && (
        <div className="mt-3 border-t border-line-soft pt-3">
          {confirmed && !editing ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
              <Check className="h-4 w-4 text-green" aria-hidden="true" />
              <span>{t("confirm.confirmed", { cause: confirmed === CONFIRMED_HEALTHY ? t("confirm.healthy") : confirmed })}</span>
              <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-green underline">
                {t("confirm.change")}
              </button>
            </p>
          ) : (
            <>
              <p className="text-xs font-semibold text-ink-2">{t("confirm.title")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(status === "done" ? causes!.causes : []).map((c, i) => (
                  <button key={i} type="button" disabled={busy} onClick={() => void confirm(c.name)} className="min-h-[40px] rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink-2 disabled:opacity-40">
                    {c.name}
                  </button>
                ))}
                <button type="button" disabled={busy} onClick={() => void confirm(CONFIRMED_HEALTHY)} className="min-h-[40px] rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink-2 disabled:opacity-40">
                  {t("confirm.healthy")}
                </button>
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                  maxLength={MAX_CONFIRMED_CHARS}
                  placeholder={t("confirm.other")}
                  aria-label={t("confirm.other")}
                  className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder-ink-4 focus:outline-none focus:ring-2 focus:ring-green"
                />
                <button type="button" disabled={busy || !other.trim()} onClick={() => void confirm(other)} className="min-h-[40px] rounded-lg bg-green px-3 text-xs font-semibold text-white disabled:opacity-40">
                  {t("confirm.save")}
                </button>
              </div>
              {confirmed && (
                <div className="mt-2 flex gap-3 text-xs">
                  <button type="button" disabled={busy} onClick={() => void confirm("")} className="font-semibold text-ink-3 underline">
                    {t("confirm.clear")}
                  </button>
                  <button type="button" onClick={() => setEditing(false)} className="font-semibold text-ink-3 underline">
                    {t("confirm.cancel")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-amber-ink">{error}</p>}
    </div>
  );
}
