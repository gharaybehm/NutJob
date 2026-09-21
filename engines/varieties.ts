/**
 * Variety as the engines see it. A block's variety is whatever the user typed or
 * picked, so names are compared by their normalised form: "Vairo®", "VAIRO
 * (IRTA)" and "vairo" are one variety. A variety the system has no data for is
 * fine: it is stored as typed and the engines use their general values for the
 * crop, saying so. Recognition is per crop.
 */
import { optionKey } from '@/utils/plant-catalog'
import { findCrop, varietiesFor } from '@/utils/crops'

export interface VarietyMatch {
  /** The normalised name, for comparing. */
  key: string
  /** The name as the reference list spells it, when it is on the list. */
  canonical: string | null
  /** True when the variety is on the crop's reference list. */
  recognised: boolean
  /** True when the crop has a profile, so "not recognised" means something. */
  cropHasProfile: boolean
}

/** `cropType` is the block's crop as typed; omitted, it is read as almond (the original crop). */
export function resolveVariety(name: string | null | undefined, cropType: string | null | undefined = 'almond'): VarietyMatch {
  const key = optionKey(name)
  const canonical = varietiesFor(cropType).find(v => optionKey(v) === key) ?? null
  return { key, canonical, recognised: key !== '' && canonical !== null, cropHasProfile: findCrop(cropType) !== null }
}
