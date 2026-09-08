/* eslint-disable @typescript-eslint/no-explicit-any -- farm_members is not in the generated Supabase types */
import { createClient } from '@/utils/supabase/server';

export type FarmRole = 'admin' | 'supervisor' | 'worker';

/** Ordered least- to most-privileged. Index comparison is the whole ranking. */
const RANK: FarmRole[] = ['worker', 'supervisor', 'admin'];

export interface FarmActor {
  userId: string;
  role: FarmRole;
}

/**
 * The caller's role on one farm, or null if they are signed out or not a
 * member. Always the per-farm `farm_members.role` — the platform-wide
 * `user_profiles.role` is a different axis (it carries 'super_admin', which
 * never grants access to a specific farm) and must not be used for gating.
 */
export async function getFarmActor(farmId: string): Promise<FarmActor | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await (supabase as any)
    .from('farm_members')
    .select('role')
    .eq('farm_id', farmId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) return null;
  return { userId: user.id, role: membership.role as FarmRole };
}

/**
 * Gate a server action. Returns the actor on success, or an error string to
 * hand back to the client.
 *
 * RLS enforces the same matrix in the database, so this is defence in depth
 * rather than the only guard — but it produces a readable message instead of a
 * silent zero-row write, and it covers the paths that use the service-role
 * client (which bypasses RLS entirely).
 */
export type FarmRoleGate =
  | { ok: true; actor: FarmActor; error?: undefined }
  | { ok: false; actor?: undefined; error: string };

export async function requireFarmRole(farmId: string, minimum: FarmRole): Promise<FarmRoleGate> {
  const actor = await getFarmActor(farmId);
  if (!actor) return { ok: false, error: 'You do not have access to this farm.' };

  if (RANK.indexOf(actor.role) < RANK.indexOf(minimum)) {
    return { ok: false, error: `This action requires the ${minimum} role.` };
  }
  return { ok: true, actor };
}

export function atLeast(role: FarmRole | undefined, minimum: FarmRole): boolean {
  if (!role) return false;
  return RANK.indexOf(role) >= RANK.indexOf(minimum);
}

/**
 * Display names for every member of a farm, keyed by user id, for rendering
 * attribution. Depends on the `farm_comembers_read_profiles` policy added in
 * 20260909000000_tenant_isolation.sql; before that migration this returns only
 * the caller's own name, because user_profiles was readable only to its owner.
 */
export async function getFarmMemberNames(farmId: string): Promise<Map<string, string>> {
  const supabase = await createClient();

  const { data: members } = await (supabase as any)
    .from('farm_members')
    .select('user_id')
    .eq('farm_id', farmId);

  const ids: string[] = (members ?? []).map((m: { user_id: string }) => m.user_id);
  if (ids.length === 0) return new Map();

  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, full_name')
    .in('id', ids);

  return new Map(
    (profiles ?? []).map((p: { id: string; full_name: string | null }) => [
      p.id,
      p.full_name?.trim() || 'Unknown user',
    ]),
  );
}
