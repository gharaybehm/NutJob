import { Calendar, Droplet, ThermometerSun, Bug, Sprout } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { getTranslations, getLocale } from "next-intl/server";

interface CalendarEventItem {
  id: string;
  title: string;
  startDate: string;
  type: string;
}

async function getUpcomingEvents(farmId: string): Promise<CalendarEventItem[]> {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: farmBlocks } = await (supabase.from("blocks") as any)
    .select("id")
    .eq("farm_id", farmId);
  const blockIds: string[] = (farmBlocks ?? []).map((b: { id: string }) => b.id);

  let query = supabase
    .from("calendar_events")
    .select("id, title, start_date, type")
    .gte("start_date", new Date().toISOString())
    .order("start_date", { ascending: true })
    .limit(5);

  if (blockIds.length > 0) {
    query = query.or(`block_id.in.(${blockIds.join(",")}),block_id.is.null`);
  } else {
    query = query.is("block_id", null);
  }

  const { data } = await query;
  return (data ?? []).map(e => ({ id: e.id, title: e.title, startDate: e.start_date, type: e.type }));
}

function getEventIcon(type: string) {
  if (type === 'irrigation') return Droplet;
  if (type === 'fertigation') return ThermometerSun;
  if (type === 'spraying' || type === 'scouting') return Bug;
  return Sprout;
}

function getEventTheme(type: string) {
  if (type === 'irrigation') return 'bg-blue-soft text-blue';
  if (type === 'fertigation') return 'bg-gold-soft text-gold';
  if (type === 'spraying') return 'bg-purple-soft text-purple';
  if (type === 'scouting') return 'bg-green-soft text-green';
  if (type === 'pruning') return 'bg-teal-soft text-teal';
  return 'bg-tile text-ink-3';
}

export default async function UpcomingCalendar({ farmId }: { farmId: string }) {
  const [events, t, locale] = await Promise.all([
    getUpcomingEvents(farmId),
    getTranslations('dashboard.upcomingCalendar'),
    getLocale(),
  ]);
  const count = events.length;

  function formatEventTime(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((dateDay.getTime() - nowDay.getTime()) / (1000 * 60 * 60 * 24));
    const timeString = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });

    if (diffDays === 0) return t('today', { time: timeString });
    if (diffDays === 1) return t('tomorrow', { time: timeString });
    if (diffDays === -1) return t('yesterday', { time: timeString });

    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date);
    const day = new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(date);
    const month = new Intl.DateTimeFormat(locale, { month: 'short' }).format(date);
    return `${weekday} ${day} ${month}, ${timeString}`;
  }

  return (
    <div className="flex flex-col rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="font-heading text-base font-semibold text-ink">{t('title')}</h2>
        <Calendar className="h-[19px] w-[19px] text-green" />
      </div>
      <div className="p-4">
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center gap-1 text-ink-4">
            <Calendar className="h-8 w-8 stroke-1" />
            <p className="text-sm font-medium">{t('noEvents')}</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {events.slice(0, 3).map((event) => {
              const Icon = getEventIcon(event.type);
              const theme = getEventTheme(event.type);

              return (
                <li key={event.id} className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-tile transition-colors">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${theme}`}>
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-ink truncate">{event.title}</p>
                    <p className="font-mono text-[10px] text-ink-3">{formatEventTime(event.startDate)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Link
          href={`/${farmId}/calendar`}
          className="block mt-3 w-full text-center rounded-lg bg-tile py-2 text-sm font-semibold text-ink-2 hover:bg-tile-2 transition-colors"
        >
          {t('viewFullCalendar')}
        </Link>
      </div>
    </div>
  );
}
