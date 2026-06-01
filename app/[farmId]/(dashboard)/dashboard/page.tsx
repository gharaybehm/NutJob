import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import KPIGrid from "@/app/components/dashboard/KPIGrid";
import WeatherStrip from "@/app/components/dashboard/WeatherStrip";
import ActiveAlerts from "@/app/components/dashboard/ActiveAlerts";
import BlockStatusGrid from "@/app/components/dashboard/BlockStatusGrid";
import UpcomingCalendar from "@/app/components/dashboard/UpcomingCalendar";
import ActivityFeed from "@/app/components/dashboard/ActivityFeed";
import { Layers, CalendarDays, FlaskConical, Cpu, ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

export const dynamic = 'force-dynamic';

function KPISkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  );
}

function CardSkeleton({ height }: { height: string }) {
  return <div className={`${height} animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800`} />;
}

async function getBlockCount(farmId: string): Promise<number> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (supabase.from("blocks") as any)
    .select("id", { count: "exact", head: true })
    .eq("farm_id", farmId);
  return count ?? 0;
}

const STEP_ICONS = [Layers, FlaskConical, CalendarDays, Cpu];
const STEP_HREFS = ["blocks", "blocks", "calendar", "settings"];
const STEP_COLORS = [
  "bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400",
  "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
  "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400",
  "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400",
];
const STEP_BORDERS = [
  "border-brand-200 dark:border-brand-800 hover:border-brand-400",
  "border-blue-200 dark:border-blue-800 hover:border-blue-400",
  "border-emerald-200 dark:border-emerald-800 hover:border-emerald-400",
  "border-amber-200 dark:border-amber-800 hover:border-amber-400",
];

async function FarmSetup({ farmId }: { farmId: string }) {
  const t = await getTranslations('dashboard.page');
  const stepKeys = ['blocks', 'soilTest', 'calendar', 'sensors'] as const;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t('welcomeTitle')}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t('welcomeSubtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {stepKeys.map((key, i) => {
          const Icon = STEP_ICONS[i];
          return (
            <Link
              key={key}
              href={`/${farmId}/${STEP_HREFS[i]}`}
              className={`flex items-start gap-4 rounded-xl border bg-white dark:bg-slate-900 p-5 transition-all hover:shadow-md ${STEP_BORDERS[i]}`}
            >
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${STEP_COLORS[i]}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t(`steps.${key}.title`)}
                  </p>
                  <ArrowRight className="h-4 w-4 text-slate-400 shrink-0 rtl:rotate-180" />
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {t(`steps.${key}.desc`)}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-6 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t('emptyHint')}
        </p>
      </div>
    </div>
  );
}

export default async function Dashboard({ params }: { params: Promise<{ farmId: string }> }) {
  const { farmId } = await params;
  const [blockCount, t] = await Promise.all([
    getBlockCount(farmId),
    getTranslations('dashboard.page'),
  ]);

  if (blockCount === 0) {
    return <FarmSetup farmId={farmId} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t('subtitle')}
        </p>
      </div>

      <Suspense fallback={<KPISkeleton />}>
        <KPIGrid farmId={farmId} />
      </Suspense>

      <Suspense fallback={<CardSkeleton height="h-24" />}>
        <WeatherStrip farmId={farmId} />
      </Suspense>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Suspense fallback={<CardSkeleton height="h-64" />}>
            <ActiveAlerts farmId={farmId} />
          </Suspense>
          <Suspense fallback={<CardSkeleton height="h-72" />}>
            <BlockStatusGrid farmId={farmId} />
          </Suspense>
        </div>
        <div className="flex flex-col gap-6">
          <Suspense fallback={<CardSkeleton height="h-56" />}>
            <UpcomingCalendar farmId={farmId} />
          </Suspense>
          <Suspense fallback={<CardSkeleton height="h-64" />}>
            <ActivityFeed farmId={farmId} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
