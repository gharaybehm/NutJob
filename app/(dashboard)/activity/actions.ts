"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";

export type ActivityLogEntry = {
  id: string;
  title: string;
  activity_type: "irrigation" | "fertigation" | "spraying" | "pruning" | "scouting" | "pollinating" | "tilling" | "plowing" | "weeding" | "tissue-sample" | "other";
  block_id: string | null;
  description: string | null;
  performed_at: string;
  performed_by: string | null;
  created_at: string;
  blocks: { name: string } | null;
};

export async function getActivityLog(params?: {
  search?: string;
  activity_type?: string;
  block_id?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: ActivityLogEntry[]; total: number }> {
  const supabase = await createClient();

  let query = supabase
    .from("activity_log")
    .select("id, title, activity_type, block_id, description, performed_at, performed_by, created_at, blocks(name)", {
      count: "exact",
    })
    .order("performed_at", { ascending: false });

  if (params?.search) {
    query = query.ilike("title", `%${params.search}%`);
  }

  if (params?.activity_type && params.activity_type !== "all") {
    query = query.eq("activity_type", params.activity_type as ActivityLogEntry["activity_type"]);
  }

  if (params?.block_id && params.block_id !== "all") {
    query = query.eq("block_id", params.block_id);
  }

  const pageSize = params?.limit ?? 50;
  const offset = params?.offset ?? 0;
  query = query.range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;

  if (error) throw new Error(error.message);

  return {
    entries: (data ?? []) as ActivityLogEntry[],
    total: count ?? 0,
  };
}

export async function getBlocks() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("blocks")
    .select("id, name")
    .order("name");
  return data ?? [];
}

export async function logActivity(params: {
  title: string;
  activity_type: ActivityLogEntry["activity_type"];
  block_id: string | null;
  description: string | null;
  performed_at: string;
}): Promise<{ id: string }> {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Unauthorised");

  const { data, error } = await admin
    .from("activity_log")
    .insert({
      title: params.title,
      activity_type: params.activity_type,
      block_id: params.block_id,
      description: params.description,
      performed_at: params.performed_at,
      performed_by: user.id,
      details: { source: "manual" },
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/activity");
  return { id: data.id };
}
