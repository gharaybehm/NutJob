import Sidebar from "@/app/components/Sidebar";
import TopNav from "@/app/components/TopNav";
import BottomNav from "@/app/components/BottomNav";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  // Get name from user metadata if it exists
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || "";

  // Fetch user profile
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

  return (
    <>
      <Sidebar userEmail={user.email} userName={profile.full_name ?? fullName} userRole={profile.role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopNav />
        <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-6 md:pb-6">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
      <BottomNav userRole={profile.role} />
    </>
  );
}
