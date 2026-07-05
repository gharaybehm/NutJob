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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: membership } = await (supabase as any)
    .from("farm_members")
    .select("role")
    .eq("farm_id", farmId)
    .eq("user_id", user.id)
    .single();

  // Per-farm role takes precedence over the global profile role, matching settings/page.tsx
  const effectiveRole = (membership?.role as 'admin' | 'supervisor' | 'worker' | undefined) ?? profile?.role;

  if (effectiveRole === "worker") {
    redirect(`/${farmId}/dashboard?error=Unauthorized`);
  }

  const [recommendations, t] = await Promise.all([
    getRecommendations(farmId),
    getTranslations('recommendations'),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold text-ink tracking-tight">
          {t('pageTitle')}
        </h1>
        <p className="text-ink-2 mt-1">
          {t('pageSubtitle')}
        </p>
      </div>

      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <RecommendationsClient initialRecommendations={recommendations as any} farmId={farmId} />
    </div>
  );
}
