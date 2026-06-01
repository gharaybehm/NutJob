import { createClient } from '@/utils/supabase/server';

export interface FarmCoords {
  latitude: number;
  longitude: number;
}

/**
 * Resolve the GPS coordinates for a farm.
 *
 * Priority:
 * 1. Farm-level gps_lat / gps_lng
 * 2. Centroid of the first block's boundary polygon
 * 3. null (no coordinates available)
 */
export async function getFarmCoords(farmId: string): Promise<FarmCoords | null> {
  const supabase = await createClient();

  // 1. Try farm-level GPS
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: farm } = await (supabase as any)
    .from('farms')
    .select('gps_lat, gps_lng')
    .eq('id', farmId)
    .single();

  if (farm?.gps_lat != null && farm?.gps_lng != null) {
    return { latitude: farm.gps_lat, longitude: farm.gps_lng };
  }

  // 2. Fallback: compute centroid from first block with a boundary
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: blocks } = await (supabase as any)
    .from('blocks')
    .select('boundary')
    .eq('farm_id', farmId)
    .not('boundary', 'is', null)
    .limit(10);

  if (blocks && blocks.length > 0) {
    // Collect all boundary points across blocks for a better centroid
    const allPoints: { lat: number; lng: number }[] = [];
    for (const block of blocks) {
      if (Array.isArray(block.boundary)) {
        for (const pt of block.boundary) {
          if (pt?.lat != null && pt?.lng != null) {
            allPoints.push(pt);
          }
        }
      }
    }

    if (allPoints.length > 0) {
      const latitude = allPoints.reduce((sum, p) => sum + p.lat, 0) / allPoints.length;
      const longitude = allPoints.reduce((sum, p) => sum + p.lng, 0) / allPoints.length;
      return { latitude: Math.round(latitude * 10000) / 10000, longitude: Math.round(longitude * 10000) / 10000 };
    }
  }

  return null;
}
