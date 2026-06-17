// Temporary hand-written types for the farms and farm_members tables.
// Delete this file after regenerating types.ts from Supabase once the migration is applied.

export interface Farm {
  id: string;
  name: string;
  slug: string;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_zoom: number | null;
  address: string | null;
  total_area: number | null;
  area_unit: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  climate_profile: import("@/utils/climate-profile").ClimateProfile | null;
  climate_fetched_at: string | null;
  sensecap_api_id: string | null;
  sensecap_access_key: string | null;
}

export interface FarmMember {
  id: string;
  farm_id: string;
  user_id: string;
  role: 'admin' | 'supervisor' | 'worker';
  created_at: string;
}

export interface FarmWithMeta extends Farm {
  blockCount: number;
  userRole: 'admin' | 'supervisor' | 'worker';
}
