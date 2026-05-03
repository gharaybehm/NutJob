import Sidebar from "@/app/components/Sidebar";
import TopNav from "@/app/components/TopNav";
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

  return (
    <>
      <Sidebar userEmail={user.email} userName={fullName} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopNav />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </>
  );
}
