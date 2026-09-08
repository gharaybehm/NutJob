import { getActivityLog, getBlocks } from "./actions";
import ActivityLogClient from "@/app/components/activity/ActivityLogClient";
import { getFarmActor } from "@/utils/supabase/farm-access";
import { getTranslations, getLocale } from "next-intl/server";

export const metadata = {
  title: "Activity Log | RootLoot",
  description: "Full history of all farm actions across all blocks",
};

export default async function ActivityLogPage({
  params,
}: {
  params: Promise<{ farmId: string }>;
}) {
  const { farmId } = await params;

  // The role is the per-farm one, not the platform-wide user_profiles.role.
  // This page used the global role, so an admin on one farm got admin controls
  // on every farm they belonged to — including ones where they are a worker.
  const [{ entries, total }, blocks, actor, t, locale] = await Promise.all([
    getActivityLog({ limit: 50, farmId }),
    getBlocks(farmId),
    getFarmActor(farmId),
    getTranslations('activity'),
    getLocale(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold text-ink tracking-tight">
          {t('title')}
        </h1>
        <p className="text-ink-2 mt-1">
          {t('pageSubtitle')}
        </p>
      </div>

      <ActivityLogClient
        initialEntries={entries}
        initialTotal={total}
        blocks={blocks}
        userRole={actor?.role ?? "worker"}
        farmId={farmId}
        locale={locale}
      />
    </div>
  );
}
