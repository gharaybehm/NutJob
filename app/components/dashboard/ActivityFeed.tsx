import { CheckCircle2, FlaskConical, Tractor } from "lucide-react";

const activities = [
  {
    id: 1,
    action: "Irrigation Completed",
    block: "Block A, B",
    user: "Farm Manager",
    time: "4 hours ago",
    icon: CheckCircle2,
    color: "text-blue-500",
  },
  {
    id: 2,
    action: "Tissue Samples Sent",
    block: "All Blocks",
    user: "John D.",
    time: "Yesterday",
    icon: FlaskConical,
    color: "text-purple-500",
  },
  {
    id: 3,
    action: "Mowing",
    block: "Block E, F",
    user: "Mike T.",
    time: "Yesterday",
    icon: Tractor,
    color: "text-brand-500",
  },
];

export default function ActivityFeed() {
  return (
    <div className="flex flex-col rounded-xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Recent Activity</h2>
      </div>
      <div className="p-4">
        <div className="flow-root">
          <ul role="list" className="-mb-8">
            {activities.map((activity, activityIdx) => (
              <li key={activity.id}>
                <div className="relative pb-8">
                  {activityIdx !== activities.length - 1 ? (
                    <span className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
                  ) : null}
                  <div className="relative flex space-x-3">
                    <div>
                      <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white bg-slate-50 dark:bg-slate-800 dark:ring-slate-900 ${activity.color}`}>
                        <activity.icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                      <div>
                        <p className="text-sm text-slate-900 dark:text-white font-medium">
                          {activity.action}{" "}
                          <span className="font-normal text-slate-500">in {activity.block}</span>
                        </p>
                      </div>
                      <div className="whitespace-nowrap text-right text-xs text-slate-500">
                        {activity.time}
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
