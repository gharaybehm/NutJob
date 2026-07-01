import { Droplets, CloudRain, AlertTriangle, Timer } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { getTranslations, getLocale } from "next-intl/server";
import { formatPercent, formatMeasurement, formatNumber } from "@/utils/format";
import { getFarmCoords } from "@/utils/farm-location";

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
  const coords = await getFarmCoords(farmId);
  if (coords) {
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&daily=precipitation_sum&timezone=auto`,
        { cache: 'no-store' }
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
  }

  const nextIrrig = upcomingIrrigation?.[0];
  const diffHrs = nextIrrig
    ? Math.round((new Date(nextIrrig.start_date).getTime() - Date.now()) / 3_600_000)
    : null;

  return { avgSoilMoisture, rainForecastMm, activeAlertsCount: alertCount ?? 0, diffHrs };
}

export default async function KPIGrid({ farmId }: { farmId: string }) {
  const [t, locale] = await Promise.all([getTranslations('dashboard.kpi'), getLocale()]);
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
      value: avgSoilMoisture !== null ? formatPercent(avgSoilMoisture, locale) : "N/A",
      change: t('liveSensorAverage'),
      changeType: "neutral",
      icon: Droplets,
      color: "text-blue",
      bg: "bg-blue-soft",
    },
    {
      name: t('rainForecast'),
      value: formatMeasurement(rainForecastMm, 'mm', locale),
      change: t('expectedTotal'),
      changeType: rainForecastMm > 0 ? "positive" : "neutral",
      icon: CloudRain,
      color: "text-green",
      bg: "bg-green-soft",
    },
    {
      name: t('activeAlerts'),
      value: formatNumber(activeAlertsCount, locale),
      change: activeAlertsCount > 0 ? t('unresolved', { count: activeAlertsCount }) : t('allSystemsNominal'),
      changeType: activeAlertsCount > 0 ? "negative" : "positive",
      icon: AlertTriangle,
      color: activeAlertsCount > 0 ? "text-red" : "text-ink-3",
      bg: activeAlertsCount > 0 ? "bg-red-soft" : "bg-tile",
    },
    {
      name: t('nextIrrigation'),
      value: nextIrrigationStr,
      change: t('scheduledQueue'),
      changeType: "neutral",
      icon: Timer,
      color: "text-amber",
      bg: "bg-amber-soft",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <div
          key={kpi.name}
          className="rounded-2xl border border-line bg-surface p-[18px]"
        >
          <div className="flex items-center gap-2">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${kpi.bg}`}>
              <kpi.icon className={`h-[18px] w-[18px] ${kpi.color}`} aria-hidden="true" />
            </div>
            <p className="truncate font-mono text-[10px] tracking-wide text-ink-3">
              {kpi.name.toUpperCase()}
            </p>
          </div>
          <p className="mt-3 font-heading text-[34px] font-bold leading-none tracking-tight text-ink">
            {kpi.value}
          </p>
          <p
            className={`mt-2 text-xs font-semibold ${
              kpi.changeType === "positive"
                ? "text-green"
                : kpi.changeType === "negative"
                ? "text-red"
                : "text-ink-3"
            }`}
          >
            {kpi.change}
          </p>
        </div>
      ))}
    </div>
  );
}
