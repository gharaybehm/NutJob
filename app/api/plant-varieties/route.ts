import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { varietiesFor } from '@/utils/crops';

/**
 * GET /api/plant-varieties?plantId={id}&commonName={name}
 *
 * Returns variety/cultivar suggestions for a given plant in two layers:
 *  1. Botanical varieties & subspecies from Trefle (using the plant detail endpoint)
 *  2. Curated agricultural cultivar list for common crops (fallback / supplement)
 *
 * Both layers are merged and deduplicated, Trefle results first.
 */

type TrefleSubspecies = { common_name?: string | null; name: string };

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const plantId = request.nextUrl.searchParams.get('plantId');
  const commonName = (request.nextUrl.searchParams.get('commonName') ?? '').toLowerCase().trim();

  const token = process.env.TREFLE_API_KEY;
  let trefleVarieties: string[] = [];

  if (plantId && token) {
    try {
      const res = await fetch(
        `https://trefle.io/api/v1/plants/${plantId}?token=${token}`,
        { headers: { Accept: 'application/json' }, next: { revalidate: 300 } },
      );
      if (res.ok) {
        const data = await res.json();
        const species = data.data?.main_species;
        if (species) {
          const raw: TrefleSubspecies[] = [
            ...(species.varieties ?? []),
            ...(species.subspecies ?? []),
          ];
          trefleVarieties = raw
            .map((v) => v.common_name || v.name)
            .filter(Boolean)
            .map((n: string) => n.charAt(0).toUpperCase() + n.slice(1));
        }
      }
    } catch {
      // fall through to curated list only
    }
  }

  // The crop's own list (a profile's, else the curated one)
  const curated = varietiesFor(commonName);

  // Merge: Trefle results first, then curated entries not already present
  const seen = new Set(trefleVarieties.map((v) => v.toLowerCase()));
  const merged = [
    ...trefleVarieties,
    ...curated.filter((v) => !seen.has(v.toLowerCase())),
  ];

  return NextResponse.json(merged);
}
