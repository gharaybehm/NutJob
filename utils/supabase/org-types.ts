// Temporary hand-written types for the organizations and organization_members
// tables. Delete this file after regenerating types.ts from Supabase once
// the migration in supabase/migrations/20260817100000_create_organizations.sql
// is applied — same convention as farm-types.ts.

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';

/**
 * Stripe's subscription status as one the organizations.subscription_status
 * CHECK accepts. Stripe also sends 'unpaid', 'paused' and
 * 'incomplete_expired'; written as they are, the update fails and the
 * organization keeps a stale status. Only 'trialing' and 'active' grant seats
 * (createFarm), so each is mapped to the closest status that does not, and
 * a status Stripe adds later fails closed as 'past_due' (no seats, read-only).
 */
export function toStoredSubscriptionStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case 'trialing':
    case 'active':
    case 'past_due':
    case 'canceled':
    case 'incomplete':
      return stripeStatus;
    case 'unpaid':
    case 'paused':
      return 'past_due';
    case 'incomplete_expired':
      return 'canceled';
    default:
      return 'past_due';
  }
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  billing_email: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: SubscriptionStatus;
  farm_seats: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
}

export interface OrganizationWithMeta extends Organization {
  memberCount: number;
  farmCount: number;
}
