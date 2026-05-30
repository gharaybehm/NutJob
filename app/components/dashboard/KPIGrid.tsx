import { Droplets, CloudRain, AlertTriangle, Timer } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { getTranslations } from "next-intl/server";

async function getKPIData(farmId: string) {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: farmBlocks } = await (supabase.from("blocks") as any)
    .select("id")
    .eq("farm_id", farmId);
  const blockIds: string[] = (farmBlocks ?? []).map((b: { id: string }) => b.id);

  const blockFilter = blockIds.length > 0 ? blockIds : ["__none__"];

  const [
    { data: soilLatest },
    { count: alertCount },
    { data: upcomingIrrigation },
  ] = await Promise.all([
    supabase
      .from("soil_water_latest")
      .select("soil_moisture, block_id")
      .in("block_id", blockFilter),
    supabase
      .from("block_alerts")
      .select("*", { count: "exact", head: true })
      .in("block_id", blockFilter)
      .eq("resolved", false),
    supabase
      .from("calendar_events")
      .select("start_date")
      .eq("type", "irrigation")
      .gte("start_date", new Date().toISOString())
      .or(`block_id.in.(${blockFilter.join(",")}),block_id.is.null`)
      .order("start_date", { ascending: true })
      .limit(1),
  ]);

  const validMoisture = (soilLatest ?? [])
    .map(r => r.soil_moisture)
    .filter((v): v is number => v !== null);
  const avgSoilMoisture = validMoisture.length > 0
    ? Math.round(validMoisture.reduce((sum, v) => sum + v, 0) / validMoisture.length)
    : null;

  let rainForecastMm = 0;
  try {
    const res = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=38.08&longitude=33.57&daily=precipitation_sum&timezone=auto",
      { next: { revalidate: 3600 } }
    );
    if (res.ok) {
      const json = await res.json();
      rainForecastMm = Math.round(
        (json.daily?.precipitation_sum ?? []).reduce((acc: number, v: number) => acc + (v || 0), 0)
      );
    }
  } catch {
    // Open-Meteo unavailable — 0 shown
  }

  const nextIrrig = upcomingIrrigation?.[0];
  const diffHrs = nextIrrig
    ? Math.round((new Date(nextIrrig.start_date).getTime() - Date.now()) / 3_600_000)
    : null;

  return { avgSoilMoisture, rainForecastMm, activeAlertsCount: alertCount ?? 0, diffHrs };
}

export default async function KPIGrid({ farmId }: { farmId: string }) {
  const t = await getTranslations('dashboard.kpi');
  const { avgSoilMoisture, rainForecastMm, activeAlertsCount, diffHrs } = await getKPIData(farmId);

  let nextIrrigationStr: string;
  if (diffHrs === null) {
    nextIrrigationStr = t('noneScheduled');
  } else if (diffHrs <= 0) {
    nextIrrigationStr = t('ongoing');
  } else if (diffHrs < 24) {
    nextIrrigationStr = t('inHours', { hours: diffHrs });
  } else {
    nextIrrigationStr = t('inDays', { days: Math.round(diffHrs / 24) });
  }

  const kpis = [
    {
      name: t('avgSoilMoisture'),
      value: avgSoilMoisture !== null ? `${avgSoilMoisture}%` : "N/A",
      change: t('liveSensorAverage'),
      changeType: "neutral",
      icon: Droplets,
      color: "text-blue-500",
      bg: "bg-blue-100 dark:bg-blue-900/30",
    },
    {
      name: t('rainForecast'),
      value: `${rainForecastMm} mm`,
      change: t('expectedTotal'),
      changeType: rainForecastMm > 0 ? "positive" : "neutral",
      icon: CloudRain,
      color: "text-brand-500",
      bg: "bg-brand-100 dark:bg-brand-900/30",
    },
    {
      name: t('activeAlerts'),
      value: String(activeAlertsCount),
      change: activeAlertsCount > 0 ? t('unresolved', { count: activeAlertsCount }) : t('allSystemsNominal'),
      changeType: activeAlertsCount > 0 ? "negative" : "positive",
      icon: AlertTriangle,
      color: activeAlertsCount > 0 ? "text-red-500" : "text-slate-400",
      bg: activeAlertsCount > 0 ? "bg-red-100 dark:bg-red-900/30" : "bg-slate-100 dark:bg-slate-800/30",
    },
    {
      name: t('nextIrrigation'),
      value: nextIrrigationStr,
      change: t('scheduledQueue'),
      changeType: "neutral",
      icon: Timer,
      color: "text-amber-500",
      bg: "bg-amber-100 dark:bg-amber-900/30",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <div
          key={kpi.name}
          className="relative overflow-hidden rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
        >
          <dt>
            <div className={`absolute rounded-lg p-3 ${kpi.bg}`}>
              <kpi.icon className={`h-6 w-6 ${kpi.color}`} aria-hidden="true" />
            </div>
            <p className="ms-16 truncate text-sm font-medium text-slate-500 dark:text-slate-400">
              {kpi.name}
            </p>
          </dt>
          <dd className="ms-16 flex items-baseline pb-1 sm:pb-2">
            <p className="text-2xl font-semibold text-slate-900 dark:text-white">
              {kpi.value}
            </p>
            <p
              className={`ms-2 flex items-baseline text-sm font-semibold ${
                kpi.changeType === "positive"
                  ? "text-brand-600 dark:text-brand-400"
                  : kpi.changeType === "negative"
                  ? "text-red-600 dark:text-red-400"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {kpi.change}
            </p>
          </dd>
        </div>
      ))}
    </div>
  );
}
