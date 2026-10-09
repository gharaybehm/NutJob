/**
 * What the product library can list a product against: the pests, diseases
 * and spray targets of the crop packs a farm's blocks are bound to, and
 * those crops themselves.
 */

import type { Pack } from '@/engines/pack/schema'

export interface ProductOptions {
  /** Pack ids a product can be used against, with the name the pack gives each. */
  targets: { id: string; name: string }[]
  /** Pack ids of the farm's crops, with their names. */
  crops: { id: string; name: string }[]
}

export function productOptions(packs: Pack[]): ProductOptions {
  const targets = new Map<string, string>()
  const crops = new Map<string, string>()
  for (const pack of packs) {
    crops.set(pack.manifest.id, pack.manifest.crop.common_name)
    for (const pest of pack.pests?.pests ?? []) targets.set(pest.id, pest.name)
    for (const disease of pack.diseases?.diseases ?? []) targets.set(disease.id, disease.name)
    for (const section of Object.values(pack.seasonal ?? {})) {
      for (const template of section?.templates ?? []) {
        // A seasonal task that sprays names its own target; it has no name in the pack beyond its id.
        if (template.spray_target && !targets.has(template.spray_target)) targets.set(template.spray_target, template.spray_target)
      }
    }
  }
  const sorted = (m: Map<string, string>) => [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  return { targets: sorted(targets), crops: sorted(crops) }
}
