"use client";

// App-wide fallback for everything outside the dashboard shell (farm picker,
// login, admin) and for failures in the dashboard layout itself. Renders inside
// the root layout, so translations and fonts are available here.

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, RotateCw } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorBoundary");

  useEffect(() => {
    console.error("[app error boundary]", error.digest ?? "", error);
  }, [error]);

  return (
    <div className="flex h-dvh w-full items-center justify-center bg-paper px-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-soft">
          <AlertTriangle className="h-5 w-5 text-red" />
        </span>
        <h2 className="mt-4 font-heading text-lg font-bold tracking-tight text-ink">
          {t("pageTitle")}
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
            href="/farms"
            className="flex items-center justify-center rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink-2 transition hover:bg-tile"
          >
            {t("goToFarms")}
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
