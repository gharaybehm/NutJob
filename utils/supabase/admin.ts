import { createClient } from "@supabase/supabase-js";
import { Database } from "./types";

// Service-role client — bypasses RLS. Only use in server-side code (server actions, API routes).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add SUPABASE_SERVICE_ROLE_KEY to .env.local (find it in Supabase → Project Settings → API → service_role key)."
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });
}
