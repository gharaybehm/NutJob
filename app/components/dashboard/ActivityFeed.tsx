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
  if (type === 'irrigation') return 'text-blue-500 bg-blue-50 dark:bg-blue-950/20';
  if (type === 'fertigation') return 'text-brand-500 bg-brand-50 dark:bg-brand-950/20';
  if (type === 'tissue-sample') return 'text-purple-500 bg-purple-50 dark:bg-purple-950/20';
  if (type === 'spraying') return 'text-red-500 bg-red-50 dark:bg-red-950/20';
  return 'text-slate-500 bg-slate-50 dark:bg-slate-800';
}

export default async function ActivityFeed({ farmId }: { farmId: string }) {
  const [activities, t] = await Promise.all([
    getActivities(farmId),
    getTranslations('dashboard.activityFeed'),
  ]);
  const count = activities.length;

  function relativeTime(dateStr: string) {
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
    <div className="flex flex-col rounded-xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{t('title')}</h2>
        <Link
          href={`/${farmId}/activity`}
          className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
        >
          {t('viewLog')}
        </Link>
      </div>
      <div className="p-4 min-h-[200px]">
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-1 text-slate-400 dark:text-slate-500">
            <ShieldAlert className="h-8 w-8 stroke-1" />
            <p className="text-sm font-medium">{t('noActivities')}</p>
          </div>
        ) : (
          <div className="flow-root">
            <ul role="list" className="-mb-8">
              {activities.slice(0, 4).map((activity, activityIdx) => {
                const Icon = getActivityIcon(activity.type);
                const colorTheme = getActivityColor(activity.type);
                const locationStr = activity.blockName ? ` ${t('inBlock', { name: activity.blockName })}` : "";

                return (
                  <li key={activity.id}>
                    <div className="relative pb-8">
                      {activityIdx !== activities.length - 1 ? (
                        <span className="absolute start-4 top-4 -ms-px h-full w-0.5 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
                      ) : null}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white dark:ring-slate-900 ${colorTheme}`}>
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-slate-900 dark:text-white font-semibold truncate">
                              {activity.action}
                              <span className="font-normal text-slate-500 dark:text-slate-400">
                                {locationStr}
                              </span>
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {t('by', { user: activity.user })}
                            </p>
                          </div>
                          <div className="whitespace-nowrap text-right text-xs text-slate-400 dark:text-slate-500">
                            {relativeTime(activity.performed_at)}
                          </div>
                        </div>
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
