import Sidebar from "@/app/components/Sidebar";
import TopNav from "@/app/components/TopNav";
import BottomNav from "@/app/components/BottomNav";
import FarmTabs from "@/app/components/farms/FarmTabs";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getFarms } from "@/app/actions/farms";

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ farmId: string }>;
}) {
  const { farmId } = await params;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) redirect("/login");

  // Verify user is a member of this farm
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: membership } = await db.from("farm_members")
    .select("role")
    .eq("farm_id", farmId)
    .eq("user_id", user.id)
    .single();

  if (!membership) redirect("/farms");

  // Fetch farm name for sidebar display
  const { data: farm } = await db.from("farms")
    .select("name")
    .eq("id", farmId)
    .single();

  if (!farm) redirect("/farms");

  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || "";

  let { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    const defaultProfile = {
      id: user.id,
      full_name: fullName || "Field Worker",
      phone: user.user_metadata?.phone || null,
      role: "worker" as const,
    };
    const { data: newProfile, error: insertError } = await supabase
      .from("user_profiles")
      .insert(defaultProfile)
      .select()
      .single();

    if (!insertError && newProfile) {
      profile = newProfile;
    } else {
      profile = {
        id: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        full_name: defaultProfile.full_name,
        phone: defaultProfile.phone,
        role: "worker",
      };
    }
  }

  // Per-farm role takes precedence for UI gating
  const effectiveRole = (membership.role as "admin" | "supervisor" | "worker") ?? profile.role;

  // All farms for the tab bar
  const allFarms = await getFarms();

  return (
    <>
      <Sidebar
        userEmail={user.email}
        userName={profile.full_name ?? fullName}
        userRole={effectiveRole}
        farmId={farmId}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopNav farmId={farmId} />
        <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-6 md:pb-6 md:pr-14">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
      <BottomNav userRole={effectiveRole} farmId={farmId} />
      <FarmTabs farms={allFarms} currentFarmId={farmId} maxFarms={3} />
    </>
  );
}
