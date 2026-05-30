import { getActivityLog, getBlocks } from "./actions";
import ActivityLogClient from "@/app/components/activity/ActivityLogClient";
import { createClient } from "@/utils/supabase/server";
import { getTranslations, getLocale } from "next-intl/server";

export const metadata = {
  title: "Activity Log | NutJob",
  description: "Full history of all farm actions across all blocks",
};

export default async function ActivityLogPage({
  params,
}: {
  params: Promise<{ farmId: string }>;
}) {
  const { farmId } = await params;
  const supabase = await createClient();

  const [{ entries, total }, blocks, { data: { user } }, t, locale] = await Promise.all([
    getActivityLog({ limit: 50, farmId }),
    getBlocks(farmId),
    supabase.auth.getUser(),
    getTranslations('activity'),
    getLocale(),
  ]);

  const { data: profile } = user
    ? await supabase.from("user_profiles").select("role").eq("id", user.id).single()
    : { data: null };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          {t('title')}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          {t('pageSubtitle')}
        </p>
      </div>

      <ActivityLogClient
        initialEntries={entries}
        initialTotal={total}
        blocks={blocks}
        userRole={profile?.role ?? "worker"}
        farmId={farmId}
        locale={locale}
      />
    </div>
  );
}
