import React from "react";
import RecommendationsClient from "@/app/components/recommendations/RecommendationsClient";
import { getRecommendations } from "./actions";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Recommendations | RootLoot",
  description: "AI-powered agronomic insights and action items",
};

export default async function RecommendationsPage({
  params,
}: {
  params: Promise<{ farmId: string }>;
}) {
  const { farmId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "worker") {
    redirect(`/${farmId}/dashboard?error=Unauthorized`);
  }

  const [recommendations, t] = await Promise.all([
    getRecommendations(),
    getTranslations('recommendations'),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          {t('pageTitle')}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          {t('pageSubtitle')}
        </p>
      </div>

      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <RecommendationsClient initialRecommendations={recommendations as any} farmId={farmId} />
    </div>
  );
}
