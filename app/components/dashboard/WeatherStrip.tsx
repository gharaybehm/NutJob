import { Sun, Cloud, CloudRain, CloudLightning, CloudSnow, CloudDrizzle, CloudFog } from "lucide-react";

// WMO Weather interpretation codes
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

export default async function WeatherStrip() {
  let forecast: { day: string; date: string; icon: ReturnType<typeof getWeatherIcon>; tempH: number; tempL: number; rain: number; rawDate: string }[] = [];
  try {
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=38.08&longitude=33.57&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto', { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = await res.json();
      forecast = data.daily.time.map((timeStr: string, index: number) => {
        const dateObj = new Date(timeStr);
        const day = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(dateObj);
        const date = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' }).format(dateObj);
        const code = data.daily.weather_code[index];
        const tempH = Math.round(data.daily.temperature_2m_max[index]);
        const tempL = Math.round(data.daily.temperature_2m_min[index]);
        const rain = data.daily.precipitation_probability_max[index];
        return {
          day,
          date,
          icon: getWeatherIcon(code),
          tempH,
          tempL,
          rain,
          rawDate: timeStr
        };
      });
    }
  } catch (error) {
    console.error("Error fetching weather data", error);
  }

  if (forecast.length === 0) {
    return (
      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <div className="flex items-center justify-between mb-4 px-2">
          <h2 className="text-base font-semibold leading-6 text-slate-900 dark:text-white">7-Day Weather Forecast</h2>
          <span className="text-sm text-slate-500">38.08°N, 33.57°E</span>
        </div>
        <div className="text-sm text-slate-500 px-2">Failed to load weather data.</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="flex items-center justify-between mb-4 px-2">
        <h2 className="text-base font-semibold leading-6 text-slate-900 dark:text-white">7-Day Weather Forecast</h2>
        <span className="text-sm text-slate-500">38.08°N, 33.57°E</span>
      </div>
      <div className="flex w-full overflow-x-auto gap-4 pb-2">
        {forecast.map((day) => {
          const Icon = day.icon;
          return (
            <div key={day.rawDate} className="flex min-w-[80px] flex-col items-center justify-center rounded-lg p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <span className="text-sm font-medium text-slate-900 dark:text-white">{day.day}</span>
              <span className="text-xs text-slate-500 mb-2">{day.date}</span>
              <Icon className={`h-8 w-8 mb-2 ${day.rain > 50 ? 'text-blue-500' : day.rain > 0 ? 'text-slate-400' : 'text-amber-400'}`} />
              <div className="flex gap-2 text-sm font-medium">
                <span className="text-slate-900 dark:text-white">{day.tempH}°</span>
                <span className="text-slate-400">{day.tempL}°</span>
              </div>
              {day.rain > 0 && (
                <span className="text-xs text-blue-500 font-medium mt-1">{day.rain}%</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
