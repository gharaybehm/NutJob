"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Camera, CheckCircle2, Images, Loader2, RefreshCw, Send, Trash2, TriangleAlert, WifiOff, X } from "lucide-react";
import { useOnlineStatus } from "@/app/components/assistant/useOnlineStatus";
import { MAX_NOTE_CHARS, MAX_PHOTOS, newCaseId } from "@/utils/photo/case";
import { addCase, removeCase, retryCase } from "@/utils/photo/outbox";
import { preparePhoto } from "@/utils/photo/prepare";
import type { QualityIssue } from "@/utils/photo/quality";
import { usePhotoCases, type PhotoBlock } from "./PhotoCaseProvider";

interface DraftPhoto {
  key: number;
  bytes: ArrayBuffer;
  url: string;
  /** Quality warnings the user has not answered yet; empty once kept. */
  warnings: QualityIssue[];
}

type Notice = { type: "success" | "error" | "info"; text: string };

const INPUT =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder-ink-4 focus:outline-none focus:ring-2 focus:ring-green";

/**
 * Take or choose up to three photos of one problem, check each on the device,
 * and save the case. Works with no connection: the case waits on the device
 * and is sent when there is signal.
 */
export default function PhotoCaseDrawer({
  farmId,
  userId,
  blocks,
  initialBlockId,
  onClose,
}: {
  farmId: string;
  userId: string;
  blocks: PhotoBlock[];
  initialBlockId?: string;
  onClose: () => void;
}) {
  const t = useTranslations("photos");
  const locale = useLocale();
  const online = useOnlineStatus();
  const queue = usePhotoCases();
  const titleId = useId();

  const [blockId, setBlockId] = useState(initialBlockId ?? (blocks.length === 1 ? blocks[0].id : ""));
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [note, setNote] = useState("");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const nextKey = useRef(1);
  const urls = useRef(new Set<string>());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const made = urls.current;
    return () => {
      window.removeEventListener("keydown", onKey);
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [onClose]);

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setNotice(null);
    setChecking(true);
    const room = MAX_PHOTOS - photos.length;
    const added: DraftPhoto[] = [];
    const refused: string[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      const result = await preparePhoto(file);
      if (!result.ok) {
        refused.push(t(`issues.${result.error}`));
        continue;
      }
      const { report, bytes } = result.photo;
      if (report.blocking.length > 0) {
        refused.push(report.blocking.map((i) => t(`issues.${i}`)).join(" "));
        continue;
      }
      const url = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
      urls.current.add(url);
      added.push({ key: nextKey.current++, bytes, url, warnings: report.warnings });
    }
    if (added.length > 0) setPhotos((p) => [...p, ...added].slice(0, MAX_PHOTOS));
    if (refused.length > 0) setNotice({ type: "error", text: t("refused", { reason: refused.join(" ") }) });
    setChecking(false);
  }

  function removePhoto(key: number) {
    setPhotos((p) => {
      const gone = p.find((x) => x.key === key);
      if (gone) {
        URL.revokeObjectURL(gone.url);
        urls.current.delete(gone.url);
      }
      return p.filter((x) => x.key !== key);
    });
  }

  const keepPhoto = (key: number) => setPhotos((p) => p.map((x) => (x.key === key ? { ...x, warnings: [] } : x)));

  async function save() {
    const block = blocks.find((b) => b.id === blockId);
    if (!block || photos.length === 0) return;
    setSaving(true);
    setNotice(null);
    try {
      const outcome = await addCase({
        id: newCaseId(),
        farmId,
        userId,
        blockId: block.id,
        blockName: block.name,
        note: note.trim(),
        takenAt: new Date().toISOString(),
        photos: photos.map((p) => p.bytes),
      });
      if (outcome === "full") {
        setNotice({ type: "error", text: t("queueFull") });
        setSaving(false);
        return;
      }
      // Ask the browser not to clear the queue under storage pressure. Best effort.
      void navigator.storage?.persist?.().catch(() => undefined);
      photos.forEach((p) => {
        URL.revokeObjectURL(p.url);
        urls.current.delete(p.url);
      });
      setPhotos([]);
      setNote("");
      await queue?.refresh();
      const result = await queue?.send();
      setNotice(result && result.sent > 0 && result.waiting === 0 ? { type: "success", text: t("sent") } : { type: "info", text: t("savedOnPhone") });
    } catch {
      setNotice({ type: "error", text: t("saveFailed") });
    }
    setSaving(false);
  }

  async function discard(id: string) {
    if (!window.confirm(t("queue.confirmDelete"))) return;
    await removeCase(id);
    await queue?.refresh();
  }

  async function tryAgain(id: string) {
    await retryCase(id);
    await queue?.refresh();
    await queue?.send();
  }

  const undecided = photos.some((p) => p.warnings.length > 0);
  const canSave = Boolean(blockId) && photos.length > 0 && !undecided && !checking && !saving;
  const entries = queue?.entries ?? [];
  const waiting = entries.filter((e) => e.state !== "failed").length;
  const when = (iso: string) => new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" role="presentation">
      <div className="absolute inset-0 hidden bg-ink/40 md:block" onClick={onClose} aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full flex-col bg-surface shadow-[0_22px_50px_-12px_rgba(20,37,27,.4)] md:w-[460px] md:border-s md:border-line"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-line bg-paper-2 px-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-green-soft text-green">
            <Camera className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 id={titleId} className="flex-1 truncate font-heading text-base font-semibold text-ink">
            {t("title")}
          </h2>
          <button type="button" onClick={onClose} className="h-10 w-10 flex items-center justify-center rounded-full text-ink-3 hover:bg-tile" aria-label={t("close")}>
            <X className="h-5 w-5" />
          </button>
        </header>

        {!online && (
          <div role="status" className="flex items-center gap-2 border-b border-line bg-amber-soft px-4 py-2 text-xs text-amber-ink">
            <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("offline")}
          </div>
        )}

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3">
            {t("block")}
            <select value={blockId} onChange={(e) => setBlockId(e.target.value)} className={`${INPUT} mt-1.5 font-normal normal-case tracking-normal`}>
              <option value="">{blocks.length === 0 ? t("noBlocks") : t("chooseBlock")}</option>
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">{t("photos", { count: photos.length, max: MAX_PHOTOS })}</p>
            <p className="mt-1 text-xs text-ink-3">{t("tip")}</p>

            {photos.length > 0 && (
              <ul className="mt-3 grid grid-cols-3 gap-2">
                {photos.map((p, i) => (
                  <li key={p.key} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local preview from memory, not a remote image */}
                    <img src={p.url} alt={t("photoAlt", { n: i + 1 })} className={`aspect-square w-full rounded-lg object-cover ${p.warnings.length > 0 ? "ring-2 ring-amber-ink" : "border border-line"}`} />
                    <button
                      type="button"
                      onClick={() => removePhoto(p.key)}
                      aria-label={t("remove", { n: i + 1 })}
                      className="absolute end-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-ink/70 text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {photos.map((p, i) =>
              p.warnings.length === 0 ? null : (
                <div key={p.key} role="alert" className="mt-3 rounded-lg border border-line bg-amber-soft p-3 text-xs text-amber-ink">
                  <p className="flex items-start gap-2">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      {t("warn", { n: i + 1, reason: p.warnings.map((w) => t(`issues.${w}`)).join(" ") })}
                    </span>
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => removePhoto(p.key)} className="min-h-[40px] rounded-lg bg-green px-3 text-xs font-semibold text-white">
                      {t("retake")}
                    </button>
                    <button type="button" onClick={() => keepPhoto(p.key)} className="min-h-[40px] rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-ink-2">
                      {t("useAnyway")}
                    </button>
                  </div>
                </div>
              ),
            )}

            {photos.length < MAX_PHOTOS && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={checking}
                  onClick={() => cameraInput.current?.click()}
                  className="flex min-h-[48px] items-center justify-center gap-2 rounded-lg bg-green px-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <Camera className="h-5 w-5" aria-hidden="true" />
                  {t("take")}
                </button>
                <button
                  type="button"
                  disabled={checking}
                  onClick={() => libraryInput.current?.click()}
                  className="flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-line bg-tile-2 px-3 text-sm font-semibold text-ink-2 disabled:opacity-50"
                >
                  <Images className="h-5 w-5" aria-hidden="true" />
                  {t("choose")}
                </button>
              </div>
            )}
            {/* The phone's own camera and library: no camera permission is asked of the site. */}
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={libraryInput}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {checking && (
              <p className="mt-2 flex items-center gap-2 text-xs text-ink-3">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {t("checking")}
              </p>
            )}
          </div>

          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3">
            {t("note")}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={MAX_NOTE_CHARS}
              rows={2}
              placeholder={t("notePlaceholder")}
              className={`${INPUT} mt-1.5 font-normal normal-case tracking-normal`}
            />
          </label>

          {notice && (
            <p
              role="status"
              className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
                notice.type === "error" ? "bg-amber-soft text-amber-ink" : notice.type === "success" ? "bg-green-soft text-green" : "bg-tile text-ink-2"
              }`}
            >
              {notice.type === "success" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              {notice.text}
            </p>
          )}

          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-green px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {t("save")}
          </button>

          {entries.length > 0 && (
            <section className="rounded-xl border border-line bg-paper-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink-2">{t("queue.title", { count: entries.length })}</h3>
                {waiting > 0 && (
                  <button
                    type="button"
                    onClick={() => void queue?.send()}
                    disabled={!online || queue?.sending}
                    className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-ink-2 disabled:opacity-40"
                  >
                    {queue?.sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />}
                    {t("queue.sendNow")}
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-ink-3">{t("queue.help")}</p>
              <ul className="mt-2 divide-y divide-line-soft">
                {entries.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{e.blockName}</p>
                      <p className="text-xs text-ink-3">
                        {when(e.takenAt)} · {t("queue.photoCount", { count: e.photoCount })} ·{" "}
                        <span className={e.state === "failed" ? "font-semibold text-amber-ink" : ""}>{t(`queue.state.${e.state}`)}</span>
                      </p>
                    </div>
                    {e.state === "failed" && (
                      <button type="button" onClick={() => void tryAgain(e.id)} aria-label={t("queue.tryAgain")} title={t("queue.tryAgain")} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-3 hover:bg-tile">
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    )}
                    <button type="button" onClick={() => void discard(e.id)} aria-label={t("queue.delete")} title={t("queue.delete")} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-3 hover:bg-tile">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-xs text-ink-4">{t("firstOpen")}</p>
        </div>
      </section>
    </div>
  );
}
