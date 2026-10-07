/* eslint-disable @typescript-eslint/no-explicit-any -- organizations is not in the generated Supabase types */
// Whether a farm is read-only because its organisation's subscription has
// lapsed. Requirements.md, B2B item 6: past-due farms go read-only after a
// grace period. The full grace period is not built yet; for now this is used
// only where the field assistant spec asks for it (a draft cannot be accepted
// on a read-only farm), so it reads the status as it stands.

import type { SubscriptionStatus } from "@/utils/supabase/org-types";

const READ_ONLY: ReadonlySet<string> = new Set<SubscriptionStatus | "unpaid">(["past_due", "canceled", "unpaid"]);

export function isReadOnlyStatus(status: string | null | undefined): boolean {
  return status != null && READ_ONLY.has(status);
}

/** A farm with no organisation (created before billing) is never read-only. */
export async function isFarmReadOnly(admin: { from: (table: string) => any }, farmId: string): Promise<boolean> {
  const { data: farm } = await admin.from("farms").select("organization_id").eq("id", farmId).maybeSingle();
  if (!farm?.organization_id) return false;
  const { data: org } = await admin
    .from("organizations")
    .select("subscription_status")
    .eq("id", farm.organization_id)
    .maybeSingle();
  return isReadOnlyStatus(org?.subscription_status);
}
