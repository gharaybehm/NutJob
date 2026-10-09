/**
 * Harvest safeguard (CDSS spec §A10.5, SG-HAR-1): harvest tasks cannot be
 * released while any pre-harvest interval (SG-SPR-4) or re-entry interval
 * (SG-SPR-5) is active in the block. The intervals come from the product
 * labels in the farm's product library; none is assumed.
 */

import { addDays } from '../decision/weather'
import type { ProductLabel, SprayApplication } from './spray'

export interface PreHarvestHold {
  /** First date on which every recorded pre-harvest interval has passed; null when none applies. */
  clearFrom: string | null
  /** Spray entries whose interval cannot be determined: no library product named, or no interval on its label. */
  unknown: number
}

export function preHarvestHold(applications: SprayApplication[], labels: ProductLabel[]): PreHarvestHold {
  const byId = new Map(labels.map(l => [l.id, l]))
  let clearFrom: string | null = null
  let unknown = 0
  for (const a of applications) {
    const phi = a.productId ? byId.get(a.productId)?.phiDays ?? null : null
    if (phi === null) {
      unknown++
      continue
    }
    const clear = addDays(a.date, phi)
    if (clearFrom === null || clear > clearFrom) clearFrom = clear
  }
  return { clearFrom, unknown }
}
