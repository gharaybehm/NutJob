import { NextRequest, NextResponse } from 'next/server';

export type PlantResult = { id: number; commonName: string; scientificName: string };

/**
 * Canonical list of common agricultural tree / vine crops.
 * id: 0 signals a curated entry (no Trefle ID needed — variety lookup falls
 * back to the curated cultivar list in /api/plant-varieties).
 */
const CURATED_CROPS: PlantResult[] = [
  { id: 0, commonName: 'Almond',       scientificName: 'Prunus dulcis' },
  { id: 0, commonName: 'Apple',        scientificName: 'Malus domestica' },
  { id: 0, commonName: 'Apricot',      scientificName: 'Prunus armeniaca' },
  { id: 0, commonName: 'Avocado',      scientificName: 'Persea americana' },
  { id: 0, commonName: 'Cherry',       scientificName: 'Prunus avium' },
  { id: 0, commonName: 'Date',         scientificName: 'Phoenix dactylifera' },
  { id: 0, commonName: 'Fig',          scientificName: 'Ficus carica' },
  { id: 0, commonName: 'Grape',        scientificName: 'Vitis vinifera' },
  { id: 0, commonName: 'Lemon',        scientificName: 'Citrus limon' },
  { id: 0, commonName: 'Mandarin',     scientificName: 'Citrus reticulata' },
  { id: 0, commonName: 'Nectarine',    scientificName: 'Prunus persica var. nucipersica' },
  { id: 0, commonName: 'Olive',        scientificName: 'Olea europaea' },
  { id: 0, commonName: 'Orange',       scientificName: 'Citrus sinensis' },
  { id: 0, commonName: 'Peach',        scientificName: 'Prunus persica' },
  { id: 0, commonName: 'Pear',         scientificName: 'Pyrus communis' },
  { id: 0, commonName: 'Pistachio',    scientificName: 'Pistacia vera' },
  { id: 0, commonName: 'Plum',         scientificName: 'Prunus domestica' },
  { id: 0, commonName: 'Pomegranate',  scientificName: 'Punica granatum' },
  { id: 0, commonName: 'Walnut',       scientificName: 'Juglans regia' },
];

/**
 * GET /api/plant-search?q=Almond
 *
 * Returns curated agricultural crop matches when the query matches the canonical
 * list. Falls through to Trefle only when no curated crop matches — keeps results
 * clean for common species (no "Black Walnut", "Japanese Walnut", etc.).
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q');
  if (!q || q.trim().length < 2) {
    return NextResponse.json([]);
  }

  const query = q.trim().toLowerCase();

  // Check curated list first — substring match on common name
  const curatedMatches = CURATED_CROPS.filter((c) =>
    c.commonName.toLowerCase().includes(query),
  );
  if (curatedMatches.length > 0) {
    return NextResponse.json(curatedMatches);
  }

  // No curated match — fall through to Trefle for exotic / unlisted crops
  const token = process.env.TREFLE_API_KEY;
  if (!token) {
    console.error('TREFLE_API_KEY is not set');
    return NextResponse.json([]);
  }

  const url = new URL('https://trefle.io/api/v1/plants/search');
  url.searchParams.set('q', q.trim());
  url.searchParams.set('token', token);

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return NextResponse.json([]);
    }

    const data = await res.json();

    type TreflePlant = { id: number; common_name?: string | null; scientific_name: string };
    const results: PlantResult[] = (data.data ?? [])
      .filter((p: TreflePlant) => p.common_name)
      .map((p: TreflePlant) => ({
        id: p.id,
        commonName: p.common_name!.charAt(0).toUpperCase() + p.common_name!.slice(1),
        scientificName: p.scientific_name,
      }))
      .filter(
        (p: PlantResult, idx: number, arr: PlantResult[]) =>
          arr.findIndex((x) => x.commonName === p.commonName) === idx,
      );

    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}
