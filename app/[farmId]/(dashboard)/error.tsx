"use client";

// Contains a render/server-action failure to the dashboard's main content area:
// the sidebar, top nav and bottom nav stay mounted and usable, so a broken tab
// no longer takes the whole app down with it. Errors in the dashboard *layout*
// itself still fall through to app/error.tsx, and a root-layout failure to
// app/global-error.tsx.

import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, RotateCw } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorBoundary");
  const params = useParams<{ farmId: string }>();
  const farmId = typeof params?.farmId === "string" ? params.farmId : null;

  useEffect(() => {
    // The digest is the only handle on the server-side stack in production —
    // it is what made the E352 and locale-flash bugs traceable.
    console.error("[dashboard error boundary]", error.digest ?? "", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-soft">
          <AlertTriangle className="h-5 w-5 text-red" />
        </span>
        <h2 className="mt-4 font-heading text-lg font-bold tracking-tight text-ink">
          {t("title")}
        </h2>
        <p className="mt-2 text-sm text-ink-2">{t("description")}</p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="flex items-center justify-center gap-2 rounded-lg bg-green px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-105"
          >
            <RotateCw className="h-4 w-4" />
            {t("retry")}
          </button>
          <Link
            href={farmId ? `/${farmId}/dashboard` : "/farms"}
            className="flex items-center justify-center rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink-2 transition hover:bg-tile"
          >
            {farmId ? t("goToDashboard") : t("goToFarms")}
          </Link>
        </div>

        {error.digest && (
          <p className="mt-4 font-mono text-[11px] text-ink-4">
            {t("referenceLabel")}: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
