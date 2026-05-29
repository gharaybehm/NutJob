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

const SETUP_STEPS = [
  {
    icon: Layers,
    title: "Add your first block",
    description: "Draw your block boundaries on the satellite map and enter crop details.",
    href: "blocks",
    color: "bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400",
    border: "border-brand-200 dark:border-brand-800 hover:border-brand-400",
  },
  {
    icon: FlaskConical,
    title: "Log soil & water tests",
    description: "Enter soil test results per block to baseline your agronomic data.",
    href: "blocks",
    color: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-800 hover:border-blue-400",
  },
  {
    icon: CalendarDays,
    title: "Schedule your first event",
    description: "Add irrigation, spraying, or scouting events to the farm calendar.",
    href: "calendar",
    color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-800 hover:border-emerald-400",
  },
  {
    icon: Cpu,
    title: "Connect sensors",
    description: "Link IoT soil moisture and weather sensors for live data feeds.",
    href: "settings",
    color: "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-800 hover:border-amber-400",
  },
];

function FarmSetup({ farmId }: { farmId: string }) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Welcome to your new farm
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Follow the steps below to get your farm up and running.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SETUP_STEPS.map((step, i) => (
          <Link
            key={i}
            href={`/${farmId}/${step.href}`}
            className={`flex items-start gap-4 rounded-xl border bg-white dark:bg-slate-900 p-5 transition-all hover:shadow-md ${step.border}`}
          >
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${step.color}`}>
              <step.icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {step.title}
                </p>
                <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {step.description}
              </p>
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-6 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Your dashboard will populate with live data once you add blocks and start logging activity.
        </p>
      </div>
    </div>
  );
}

export default async function Dashboard({ params }: { params: Promise<{ farmId: string }> }) {
  const { farmId } = await params;
  const blockCount = await getBlockCount(farmId);

  if (blockCount === 0) {
    return <FarmSetup farmId={farmId} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Farm overview and actionable insights.
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
