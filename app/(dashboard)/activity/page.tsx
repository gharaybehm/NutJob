import { getActivityLog, getBlocks } from "./actions";
import ActivityLogClient from "@/app/components/activity/ActivityLogClient";

export const metadata = {
  title: "Activity Log | NutJob",
  description: "Full history of all farm actions across all blocks",
};

export default async function ActivityLogPage() {
  const [{ entries, total }, blocks] = await Promise.all([
    getActivityLog({ limit: 50 }),
    getBlocks(),
  ]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Activity Log
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Complete history of all actions taken across every block.
        </p>
      </div>

      <ActivityLogClient initialEntries={entries} initialTotal={total} blocks={blocks} />
    </div>
  );
}
