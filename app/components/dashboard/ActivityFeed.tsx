import { CheckCircle2, FlaskConical, Tractor, Droplets, Sprout, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { getTranslations } from "next-intl/server";

interface ActivityItem {
  id: string;
  action: string;
  blockName: string | null;
  user: string;
  performed_at: string;
  type: string;
}

async function getActivities(farmId: string): Promise<ActivityItem[]> {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: farmBlocks } = await (supabase.from("blocks") as any)
    .select("id")
    .eq("farm_id", farmId);
  const blockIds: string[] = (farmBlocks ?? []).map((b: { id: string }) => b.id);

  let query = supabase
    .from("activity_log")
    .select("id, title, activity_type, performed_at, performed_by, blocks(name)")
    .order("performed_at", { ascending: false })
    .limit(5);

  if (blockIds.length > 0) {
    query = query.or(`block_id.in.(${blockIds.join(",")}),block_id.is.null`);
  }

  const { data } = await query;

  return (data ?? []).map(act => ({
    id: act.id,
    action: act.title,
    blockName: (act.blocks as { name: string } | null)?.name ?? null,
    user: act.performed_by || "System",
    performed_at: act.performed_at,
    type: act.activity_type,
  }));
}

function getActivityIcon(type: string) {
  if (type === 'irrigation') return Droplets;
  if (type === 'fertigation') return Sprout;
  if (type === 'tissue-sample') return FlaskConical;
  if (type === 'spraying' || type === 'pruning' || type === 'harvest') return Tractor;
  return CheckCircle2;
}

function getActivityColor(type: string) {
  if (type === 'irrigation') return 'text-blue bg-blue-soft';
  if (type === 'fertigation') return 'text-gold bg-gold-soft';
  if (type === 'tissue-sample') return 'text-purple bg-purple-soft';
  if (type === 'spraying') return 'text-purple bg-purple-soft';
  if (type === 'scouting') return 'text-green bg-green-soft';
  if (type === 'pruning') return 'text-teal bg-teal-soft';
  return 'text-ink-3 bg-tile';
}

export default async function ActivityFeed({ farmId }: { farmId: string }) {
  const [activities, t] = await Promise.all([
    getActivities(farmId),
    getTranslations('dashboard.activityFeed'),
  ]);
  const count = activities.length;

  function relativeTime(dateStr: string) {
    // eslint-disable-next-line react-hooks/purity -- async server component, rendered once per request
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60_000);
    const hrs = Math.floor(mins / 60);
    if (hrs >= 24) {
      const d = Math.floor(hrs / 24);
      return d === 1 ? t('timeYesterday') : t('timeDaysAgo', { count: d });
    }
    if (hrs > 0) return hrs === 1 ? t('timeHourAgo', { count: hrs }) : t('timeHoursAgo', { count: hrs });
    if (mins > 0) return mins === 1 ? t('timeMinAgo', { count: mins }) : t('timeMinsAgo', { count: mins });
    return t('timeJustNow');
  }

  return (
    <div className="flex flex-col rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="font-heading text-base font-semibold text-ink">{t('title')}</h2>
        <Link
          href={`/${farmId}/activity`}
          className="text-xs font-semibold text-ink-2 hover:underline"
        >
          {t('viewLog')}
        </Link>
      </div>
      <div className="p-4 min-h-[200px]">
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-1 text-ink-4">
            <ShieldAlert className="h-8 w-8 stroke-1" />
            <p className="text-sm font-medium">{t('noActivities')}</p>
          </div>
        ) : (
          <div className="flow-root">
            <ul role="list">
              {activities.slice(0, 4).map((activity, activityIdx) => {
                const Icon = getActivityIcon(activity.type);
                const colorTheme = getActivityColor(activity.type);
                const locationStr = activity.blockName ? ` ${t('inBlock', { name: activity.blockName })}` : "";

                return (
                  <li key={activity.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className={`h-[30px] w-[30px] shrink-0 rounded-[9px] flex items-center justify-center ${colorTheme}`}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      {activityIdx !== activities.length - 1 && (
                        <span className="w-px flex-1 my-1 bg-line-soft" aria-hidden="true" />
                      )}
                    </div>
                    <div className={`flex min-w-0 flex-1 justify-between gap-4 ${activityIdx !== activities.length - 1 ? 'pb-3.5' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-ink">
                          <span className="font-semibold">{activity.action}</span>
                          <span className="text-ink-2">{locationStr}</span>
                        </p>
                        <p className="font-mono text-[10px] text-ink-4 mt-0.5">
                          {t('by', { user: activity.user })}
                        </p>
                      </div>
                      <div className="whitespace-nowrap text-right font-mono text-[10px] text-ink-4">
                        {relativeTime(activity.performed_at)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
