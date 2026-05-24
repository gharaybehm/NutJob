import KPIGrid from "@/app/components/dashboard/KPIGrid";
import WeatherStrip from "@/app/components/dashboard/WeatherStrip";
import ActiveAlerts from "@/app/components/dashboard/ActiveAlerts";
import BlockStatusGrid from "@/app/components/dashboard/BlockStatusGrid";
import UpcomingCalendar from "@/app/components/dashboard/UpcomingCalendar";
import ActivityFeed from "@/app/components/dashboard/ActivityFeed";
import { getDashboardData } from "./actions";

export default async function Dashboard() {
  const data = await getDashboardData();

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Farm overview and actionable insights.
        </p>
      </div>

      {/* KPI Grid */}
      <KPIGrid 
        avgSoilMoisture={data.avgSoilMoisture} 
        rainForecastMm={data.rainForecastMm} 
        activeAlertsCount={data.activeAlertsCount} 
        nextIrrigationStr={data.nextIrrigationStr} 
      />

      {/* Weather Strip */}
      <WeatherStrip />

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column (Alerts & Block Status) */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <ActiveAlerts alerts={data.alerts} />
          <BlockStatusGrid blocks={data.blocks} />
        </div>

        {/* Right Column (Calendar & Activity Feed) */}
        <div className="flex flex-col gap-6">
          <UpcomingCalendar events={data.events} />
          <ActivityFeed activities={data.activities} />
        </div>
      </div>
    </div>
  );
}
