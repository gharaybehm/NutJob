import { Suspense } from "react";
import KPIGrid from "@/app/components/dashboard/KPIGrid";
import WeatherStrip from "@/app/components/dashboard/WeatherStrip";
import ActiveAlerts from "@/app/components/dashboard/ActiveAlerts";
import BlockStatusGrid from "@/app/components/dashboard/BlockStatusGrid";
import UpcomingCalendar from "@/app/components/dashboard/UpcomingCalendar";
import ActivityFeed from "@/app/components/dashboard/ActivityFeed";

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

export default async function Dashboard({ params }: { params: Promise<{ farmId: string }> }) {
  const { farmId } = await params;

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
