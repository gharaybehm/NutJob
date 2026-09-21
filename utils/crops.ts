/**
 * Crop registry. This system is not almond-only: any crop can be grown in a
 * block, and crop-specific knowledge (frost thresholds, tree-age schedule, crop
 * coefficients, growth stages, a knowledge base) belongs to a crop PROFILE.
 * A crop with no profile is fully usable: blocks, logs, calendar and the
 * knowledge base work for it, and the engines say "no data is loaded for this
 * crop" instead of applying another crop's numbers.
 *
 * To add a crop: add a profile here (its names in any language, suggested
 * varieties and rootstocks, and which engine data it has), add its engine data
 * next to the almond data, and ingest its documents into a knowledge-base folder
 * named after `id` (see scripts/ingest-knowledge-base.ts).
 */
import { optionKey, mergeOptions } from './plant-catalog'

/** Which engine data exists for a crop. An engine must check the flag before applying a number. */
export interface CropCapabilities {
  /** Lethal temperatures by stage (weather-risk engine). */
  frost: boolean
  /** Tree-age schedule: when the crop bears and how much water it uses by age (maturity engine). */
  treeAge: boolean
  /** Crop coefficients by growth stage (irrigation engine). */
  cropCoefficients: boolean
  /** Heat-accumulation growth stages (compute-fields job and stage mapping). */
  heatStages: boolean
}

export interface CropProfile {
  /** Canonical id. Also the `crop_type` its knowledge-base documents are stored under. */
  id: string
  /** Names in any language (matched ignoring case, accents and punctuation). */
  names: string[]
  varieties: string[]
  rootstocks: string[]
  has: CropCapabilities
}

/**
 * Almond varieties: the Spanish releases and cultivars that appear in the
 * sources this system holds (IRTA, CEBAS-CSIC), then the California list the form
 * used to offer on its own.
 */
const ALMOND_VARIETIES: string[] = [
  'Vairo', 'Makako', 'Guara', 'Marinada', 'Constantí', 'Tarraco', 'Penta', 'Tardona',
  'Lauranne', 'Ferragnès', 'Marta', 'Soleta', 'Belona', 'Antoñeta', 'Tuono', 'Cambra', 'Felisia',
  'Marcona', 'Desmayo Largueta', 'Masbovera', 'Glorieta', 'Francolí',
  'Nonpareil', 'Monterey', 'Fritz', 'Carmel', 'Price', 'Independence', 'Butte', 'Padre', 'Shasta',
]

/** Rootstocks in general use, offered for any crop. */
export const GENERAL_ROOTSTOCKS: string[] = ['Nemaguard', 'Lovell', 'Hansen 536', 'Titan', 'Guardian', 'M9', 'MM106', 'Krymsk']

export const CROP_PROFILES: CropProfile[] = [
  {
    id: 'almond',
    names: ['almond', 'almonds', 'sweet almond', 'badem', 'almendro', 'almendra', 'amande', 'amandier', 'prunus dulcis'],
    varieties: ALMOND_VARIETIES,
    // Mediterranean almond and peach-almond hybrid stocks first; they matter on calcareous soil.
    rootstocks: ['GF 677', 'Garnem', 'Monegro', 'Felinem', 'Rootpac 20', 'Rootpac 40', 'Rootpac R', 'Bitter almond seedling', 'Almond seedling'],
    has: { frost: true, treeAge: true, cropCoefficients: true, heatStages: true },
  },
]

/**
 * Variety suggestions for crops that have no profile yet. Only suggestions:
 * any variety can be typed. (These were the form's built-in lists.)
 */
const CURATED_VARIETIES: Record<string, string[]> = {
  pistachio:   ['Kerman', 'Golden Hills', 'Lost Hills', 'Peters (Male)', 'Randy (Male)', 'Bob Hope'],
  cherry:      ['Bing', 'Rainier', 'Lapins', 'Sweetheart', 'Stella', 'Van', 'Montmorency', 'Morello'],
  walnut:      ['Chandler', 'Howard', 'Tulare', 'Hartley', 'Franquette', 'Vina', 'Serr'],
  fig:         ['Brown Turkey', 'Kadota', 'Calimyrna', 'Black Mission', 'Adriatic', 'Smyrna'],
  grape:       ['Cabernet Sauvignon', 'Merlot', 'Chardonnay', 'Thompson Seedless', 'Flame Seedless', 'Red Globe', 'Muscat', 'Syrah', 'Pinot Noir', 'Zinfandel'],
  apricot:     ['Blenheim', 'Tilton', 'Patterson', 'Castlebrite', 'Gold Kist', 'Modesto', 'Katy'],
  apple:       ['Gala', 'Fuji', 'Granny Smith', 'Honeycrisp', 'Red Delicious', 'Golden Delicious', 'Pink Lady', 'Braeburn', 'Jazz'],
  peach:       ['Elberta', "O'Henry", 'Zee Lady', 'Flavorcrest', 'Rich Lady', 'Summer Lady'],
  pear:        ['Bartlett', 'Bosc', "D'Anjou", 'Comice', 'Forelle', 'Starkrimson'],
  olive:       ['Manzanillo', 'Sevillano', 'Ascolano', 'Mission', 'Arbequina', 'Picual', 'Frantoio'],
  pomegranate: ['Wonderful', 'Haku Botan', 'Early Foothill', 'Balegal', 'Crimson Sky'],
  date:        ['Medjool', 'Deglet Nour', 'Zahidi', 'Barhi', 'Halawi', 'Khadrawy'],
  plum:        ['Santa Rosa', 'Friar', 'Laroda', 'Casselman', 'Simka', 'Black Amber'],
  nectarine:   ['Fantasia', 'Flavortop', 'Summer Fire', 'Honey Blaze', 'Arctic Rose'],
  avocado:     ['Hass', 'Fuerte', 'Reed', 'Bacon', 'Zutano', 'Pinkerton', 'Lamb Hass'],
  lemon:       ['Eureka', 'Lisbon', 'Meyer', 'Femminello', 'Villafranca'],
  orange:      ['Navel', 'Valencia', 'Blood Orange', 'Cara Cara', 'Hamlin', 'Moro'],
  mandarin:    ['Clementine', 'W. Murcott', 'Tango', 'Gold Nugget', 'Satsuma', 'Owari'],
}

/** The profile for a crop typed or picked by the user, or null when the crop has none yet. */
export function findCrop(name: string | null | undefined): CropProfile | null {
  const key = optionKey(name)
  if (!key) return null
  return CROP_PROFILES.find(p => optionKey(p.id) === key || p.names.some(n => optionKey(n) === key)) ?? null
}

/**
 * The `crop_type` value a crop's knowledge-base documents are stored under: the
 * profile id when the crop has one (so "Badem" finds the almond documents),
 * otherwise the normalised name typed.
 */
export function knowledgeBaseCrop(name: string | null | undefined): string | null {
  const profile = findCrop(name)
  if (profile) return profile.id
  const key = optionKey(name)
  return key || null
}

/** Whether an engine may apply crop-specific data to this crop. Unknown crops get none. */
export function cropSupports(name: string | null | undefined, capability: keyof CropCapabilities): boolean {
  return findCrop(name)?.has[capability] === true
}

/** Suggested varieties for a crop name (a profile's list, else the curated list, else none). */
export function varietiesFor(cropName: string | null | undefined): string[] {
  const profile = findCrop(cropName)
  if (profile) return profile.varieties
  const key = optionKey(cropName)
  if (!key) return []
  const hit = Object.entries(CURATED_VARIETIES).find(([k]) => key.includes(k) || (key.length >= 3 && k.includes(key)))
  return hit?.[1] ?? []
}

/** Suggested rootstocks: the crop's own first, then the general list. */
export function rootstocksFor(cropName: string | null | undefined): string[] {
  return mergeOptions(findCrop(cropName)?.rootstocks, GENERAL_ROOTSTOCKS)
}
