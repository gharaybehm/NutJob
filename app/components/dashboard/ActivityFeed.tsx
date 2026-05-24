import { CheckCircle2, FlaskConical, Tractor, Droplets, Sprout, ShieldAlert } from "lucide-react";
import Link from "next/link";

interface ActivityItem {
  id: string;
  action: string;
  blockName: string | null;
  user: string;
  time: string;
  type: string;
}

interface ActivityFeedProps {
  activities: ActivityItem[];
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

export default function ActivityFeed({ activities = [] }: ActivityFeedProps) {
  const count = activities.length;

  return (
    <div className="flex flex-col rounded-xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Recent Activity</h2>
        <Link 
          href="/activity" 
          className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
        >
          View Log
        </Link>
      </div>
      <div className="p-4 min-h-[200px]">
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-1 text-slate-400 dark:text-slate-500">
            <ShieldAlert className="h-8 w-8 stroke-1" />
            <p className="text-sm font-medium">No recent activities recorded</p>
          </div>
        ) : (
          <div className="flow-root">
            <ul role="list" className="-mb-8">
              {activities.slice(0, 4).map((activity, activityIdx) => {
                const Icon = getActivityIcon(activity.type);
                const colorTheme = getActivityColor(activity.type);
                const locationStr = activity.blockName ? ` in ${activity.blockName}` : "";

                return (
                  <li key={activity.id}>
                    <div className="relative pb-8">
                      {activityIdx !== activities.length - 1 ? (
                        <span className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
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
                              by {activity.user}
                            </p>
                          </div>
                          <div className="whitespace-nowrap text-right text-xs text-slate-400 dark:text-slate-500">
                            {activity.time}
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
