import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/plant-varieties?plantId={id}&commonName={name}
 *
 * Returns variety/cultivar suggestions for a given plant in two layers:
 *  1. Botanical varieties & subspecies from Trefle (using the plant detail endpoint)
 *  2. Curated agricultural cultivar list for common crops (fallback / supplement)
 *
 * Both layers are merged and deduplicated, Trefle results first.
 */

const CROP_VARIETIES: Record<string, string[]> = {
  almond:       ['Nonpareil', 'Monterey', 'Fritz', 'Carmel', 'Price', 'Independence', 'Butte', 'Padre', 'Shasta'],
  pistachio:    ['Kerman', 'Golden Hills', 'Lost Hills', 'Peters (Male)', 'Randy (Male)', 'Bob Hope'],
  cherry:       ['Bing', 'Rainier', 'Lapins', 'Sweetheart', 'Stella', 'Van', 'Montmorency', 'Morello'],
  walnut:       ['Chandler', 'Howard', 'Tulare', 'Hartley', 'Franquette', 'Vina', 'Serr'],
  fig:          ['Brown Turkey', 'Kadota', 'Calimyrna', 'Black Mission', 'Adriatic', 'Smyrna'],
  grape:        ['Cabernet Sauvignon', 'Merlot', 'Chardonnay', 'Thompson Seedless', 'Flame Seedless', 'Red Globe', 'Muscat', 'Syrah', 'Pinot Noir', 'Zinfandel'],
  apricot:      ['Blenheim', 'Tilton', 'Patterson', 'Castlebrite', 'Gold Kist', 'Modesto', 'Katy'],
  apple:        ['Gala', 'Fuji', 'Granny Smith', 'Honeycrisp', 'Red Delicious', 'Golden Delicious', 'Pink Lady', 'Braeburn', 'Jazz'],
  peach:        ["Elberta", "O'Henry", 'Zee Lady', 'Flavorcrest', 'Rich Lady', 'Summer Lady'],
  pear:         ['Bartlett', 'Bosc', "D'Anjou", 'Comice', 'Forelle', 'Starkrimson'],
  olive:        ['Manzanillo', 'Sevillano', 'Ascolano', 'Mission', 'Arbequina', 'Picual', 'Frantoio'],
  pomegranate:  ['Wonderful', 'Haku Botan', 'Early Foothill', 'Balegal', 'Crimson Sky'],
  date:         ['Medjool', 'Deglet Nour', 'Zahidi', 'Barhi', 'Halawi', 'Khadrawy'],
  plum:         ['Santa Rosa', 'Friar', 'Laroda', 'Casselman', 'Simka', 'Black Amber'],
  nectarine:    ['Fantasia', 'Flavortop', 'Summer Fire', 'Honey Blaze', 'Arctic Rose'],
  avocado:      ['Hass', 'Fuerte', 'Reed', 'Bacon', 'Zutano', 'Pinkerton', 'Lamb Hass'],
  lemon:        ['Eureka', 'Lisbon', 'Meyer', 'Femminello', 'Villafranca'],
  orange:       ['Navel', 'Valencia', 'Blood Orange', 'Cara Cara', 'Hamlin', 'Moro'],
  mandarin:     ['Clementine', 'W. Murcott', 'Tango', 'Gold Nugget', 'Satsuma', 'Owari'],
};

type TrefleSubspecies = { common_name?: string | null; name: string };

export async function GET(request: NextRequest) {
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

  // Find best curated match by partial name overlap
  const curatedMatch = Object.entries(CROP_VARIETIES).find(
    ([key]) => commonName.includes(key) || key.includes(commonName),
  );
  const curated = curatedMatch?.[1] ?? [];

  // Merge: Trefle results first, then curated entries not already present
  const seen = new Set(trefleVarieties.map((v) => v.toLowerCase()));
  const merged = [
    ...trefleVarieties,
    ...curated.filter((v) => !seen.has(v.toLowerCase())),
  ];

  return NextResponse.json(merged);
}
