"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { deletePhotoCase, listPhotoCases, type PhotoCaseListResult, type PhotoCaseRow } from "@/app/actions/photo-cases";
import { AddPhotosButton } from "./PhotoCaseButton";
import PhotoCaseCauses from "./PhotoCaseCauses";
import { usePhotoCases } from "./PhotoCaseProvider";

/**
 * Photo cases of one block: what was photographed, when and by whom. A worker
 * sees their own cases; supervisors and admins see all of them, each with its
 * possible causes.
 */

/** While the model is looking at a case, the list is read again this often, this many times. */
const POLL_MS = 5000;
const MAX_POLLS = 12;
export default function PhotoCaseList({ blockId }: { blockId: string }) {
  const t = useTranslations("photos.list");
  const locale = useLocale();
  const queue = usePhotoCases();
  const [data, setData] = useState<PhotoCaseListResult | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await listPhotoCases(blockId));
    } catch {
      setData({ status: "unavailable", cases: [], canManage: false });
    }
  }, [blockId]);

  // Reloads when a case from this device reaches the server.
  const sentCount = queue?.sentCount ?? 0;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch of this block's cases, again after one is sent
    void load();
  }, [load, sentCount]);

  // A case just sent is still being looked at: read again until it has an answer.
  const polls = useRef(0);
  const waitingForCauses = data?.cases.some((c) => c.causes?.status === "pending") ?? false;
  useEffect(() => {
    if (!waitingForCauses) {
      polls.current = 0;
      return;
    }
    if (polls.current >= MAX_POLLS) return;
    const timer = setTimeout(() => {
      polls.current++;
      void load();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [waitingForCauses, data, load]);

  async function remove(row: PhotoCaseRow) {
    if (!window.confirm(t("confirmDelete"))) return;
    setFailed(false);
    const res = await deletePhotoCase(blockId, row.id);
    if (res.ok) await load();
    else setFailed(true);
  }

  const onPhone = (queue?.entries ?? []).filter((e) => e.blockId === blockId).length;
  const when = (iso: string) => new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-2">
            <Camera className="h-4 w-4 text-green" />
            {t("title")}
          </h3>
          <p className="mt-1 text-xs text-ink-3">{t("intro")}</p>
        </div>
        <AddPhotosButton blockId={blockId} className="shrink-0" />
      </div>

      {onPhone > 0 && <p className="mt-3 rounded-lg bg-tile px-3 py-2 text-xs text-ink-2">{t("onPhone", { count: onPhone })}</p>}
      {failed && <p className="mt-3 text-sm text-amber-ink">{t("deleteFailed")}</p>}

      {data === null ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("loading")}
        </p>
      ) : data.status !== "ok" ? (
        <p className="mt-3 text-sm text-amber-ink">{t(`status.${data.status}`)}</p>
      ) : data.cases.length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">{data.canManage ? t("empty") : t("emptyOwn")}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {data.cases.map((c) => (
            <li key={c.id} className="rounded-lg border border-line-soft p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-ink-3">
                  <span className="font-medium text-ink-2">{when(c.takenAt)}</span>
                  {c.mine ? ` · ${t("byYou")}` : c.enteredBy ? ` · ${c.enteredBy}` : ""}
                </p>
                {data.canManage && (
                  <button type="button" onClick={() => void remove(c)} aria-label={t("delete")} title={t("delete")} className="-me-1 -mt-1 flex h-9 w-9 items-center justify-center rounded-full text-ink-3 hover:bg-tile">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {c.photos.map((url, i) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link, not optimisable */}
                    <img src={url} alt={t("photoAlt", { n: i + 1 })} loading="lazy" className="aspect-square w-full rounded-lg border border-line object-cover" />
                  </a>
                ))}
              </div>
              {c.note && <p className="mt-2 whitespace-pre-wrap text-sm text-ink-2">{c.note}</p>}
              {data.canManage && <PhotoCaseCauses blockId={blockId} caseId={c.id} causes={c.causes} onChanged={load} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
