"use client";

import { Camera } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePhotoCases } from "./PhotoCaseProvider";

/** Round camera button above the mobile navigation bar, with the number of cases still on the phone. */
export function PhotoCaseFab({ hidden = false }: { hidden?: boolean }) {
  const photos = usePhotoCases();
  const t = useTranslations("photos");
  if (!photos || hidden) return null;
  const count = photos.entries.length;
  return (
    <button
      type="button"
      onClick={() => photos.open()}
      aria-label={count > 0 ? t("openWaiting", { count }) : t("open")}
      title={t("open")}
      className="absolute bottom-full end-3 z-30 mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green text-white shadow-[0_10px_25px_-8px_rgba(20,37,27,.55)] active:scale-95 transition-transform"
    >
      <Camera className="h-6 w-6" aria-hidden="true" />
      {count > 0 && (
        <span className="absolute -end-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-ink px-1.5 text-xs font-bold text-white" aria-hidden="true">
          {count}
        </span>
      )}
    </button>
  );
}

/** "Add photos" on a block, with the block already chosen. */
export function AddPhotosButton({ blockId, className = "" }: { blockId: string; className?: string }) {
  const photos = usePhotoCases();
  const t = useTranslations("photos");
  if (!photos) return null;
  return (
    <button
      type="button"
      onClick={() => photos.open(blockId)}
      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-green px-3 text-xs font-semibold text-white ${className}`}
    >
      <Camera className="h-4 w-4" aria-hidden="true" />
      {t("list.add")}
    </button>
  );
}
