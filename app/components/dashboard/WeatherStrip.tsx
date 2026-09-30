import { Sun, Cloud, CloudRain, CloudLightning, CloudSnow, CloudDrizzle, CloudFog } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { formatTemp, formatMeasurement } from "@/utils/format";
import { getFarmCoords } from "@/utils/farm-location";

function getWeatherIcon(code: number) {
  if (code === 0) return Sun;
  if (code === 1 || code === 2 || code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if (code === 51 || code === 53 || code === 55 || code === 56 || code === 57) return CloudDrizzle;
  if (code === 61 || code === 63 || code === 65 || code === 66 || code === 67 || code === 80 || code === 81 || code === 82) return CloudRain;
  if (code === 71 || code === 73 || code === 75 || code === 77 || code === 85 || code === 86) return CloudSnow;
  if (code === 95 || code === 96 || code === 99) return CloudLightning;
  return Sun;
}

/** Label-typical upper limit for ground spraying (≈4 m/s). */
const SPRAY_MAX_WIND_KMH = 15;

export default async function WeatherStrip({ farmId }: { farmId: string }) {
  const [t, locale, coords] = await Promise.all([getTranslations('dashboard.weather'), getLocale(), getFarmCoords(farmId)]);

  if (!coords) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between mb-4 px-2">
          <h2 className="font-heading text-base font-semibold leading-6 text-ink">{t('title')}</h2>
        </div>
        <div className="text-sm text-ink-3 px-2">{t('failedToLoad')}</div>
      </div>
    );
  }

  const coordLabel = `${coords.latitude.toFixed(2)}°N, ${coords.longitude.toFixed(2)}°E`;

  let forecast: { day: string; date: string; icon: ReturnType<typeof getWeatherIcon>; tempH: number; tempL: number; rainMm: number; windKmh: number; sprayOk: boolean; rawDate: string }[] = [];
  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max&timezone=auto`;
    const res = await fetch(weatherUrl, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      forecast = data.daily.time.map((timeStr: string, index: number) => {
        const dateObj = new Date(timeStr);
        const day = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(dateObj);
        const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(dateObj);
        const code = data.daily.weather_code[index];
        const tempH = Math.round(data.daily.temperature_2m_max[index]);
        const tempL = Math.round(data.daily.temperature_2m_min[index]);
        const rainProb = data.daily.precipitation_probability_max[index] ?? 0;
        const rainMm = Math.round((data.daily.precipitation_sum[index] ?? 0) * 10) / 10;
        const windKmh = Math.round(data.daily.wind_speed_10m_max[index] ?? 0);
        // Rough daily screen for a spray window: calm and dry. The daily max
        // wind is conservative; the hour-level window is the applicator's call.
        const sprayOk = windKmh <= SPRAY_MAX_WIND_KMH && rainMm < 0.5 && rainProb < 30;
        return { day, date, icon: getWeatherIcon(code), tempH, tempL, rainMm, windKmh, sprayOk, rawDate: timeStr };
      });
    }
  } catch (error) {
    console.error("Error fetching weather data", error);
  }

  if (forecast.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between mb-4 px-2">
          <h2 className="font-heading text-base font-semibold leading-6 text-ink">{t('title')}</h2>
          <span className="text-sm text-ink-3">{coordLabel}</span>
        </div>
        <div className="text-sm text-ink-3 px-2">{t('failedToLoad')}</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between mb-4 px-2">
        <h2 className="font-heading text-base font-semibold leading-6 text-ink">{t('title')}</h2>
        <span className="text-sm text-ink-3">{coordLabel}</span>
      </div>
      <div className="flex w-full overflow-x-auto gap-4 pb-2">
        {forecast.map((day) => {
          const Icon = day.icon;
          return (
            <div key={day.rawDate} className="flex min-w-[80px] flex-col items-center justify-center rounded-xl p-3 hover:bg-tile transition-colors">
              <span className="font-mono text-[11px] tracking-wide text-ink-3">{day.day.toUpperCase()}</span>
              <span className="text-xs text-ink-4 mb-2">{day.date}</span>
              <Icon className={`h-7 w-7 mb-2 ${day.rainMm >= 1 ? 'text-blue-ink' : day.rainMm > 0 ? 'text-ink-3' : 'text-amber-ink'}`} aria-hidden="true" />
              <div className="flex gap-2 text-sm font-semibold font-heading">
                <span className="text-ink" dir="ltr">{formatTemp(day.tempH, locale)}</span>
                <span className="text-ink-4" dir="ltr">{formatTemp(day.tempL, locale)}</span>
              </div>
              <span className={`font-mono text-[11px] mt-1 ${day.rainMm > 0 ? 'text-blue-ink font-semibold' : 'text-ink-3'}`} dir="ltr">
                {formatMeasurement(day.rainMm, 'mm', locale, 1)}
              </span>
              <span className="font-mono text-[11px] text-ink-3" dir="ltr">{formatMeasurement(day.windKmh, 'km/h', locale)}</span>
              {day.sprayOk && (
                <span className="mt-1.5 rounded-md bg-green-soft px-1.5 py-0.5 text-[11px] font-semibold text-green">{t('sprayOk')}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
