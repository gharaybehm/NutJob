/** Block areas are stored with a unit: Dunm (decare, 1000 m²), Acre or Hectare. */
const HECTARES_PER_UNIT: Record<string, number> = {
  dunm: 0.1,
  dunum: 0.1,
  decare: 0.1,
  acre: 0.404686,
  hectare: 1,
  ha: 1,
}

/** Returns hectares, or null when the area or unit is missing or unknown. */
export function toHectares(area: number | string | null | undefined, unit: string | null | undefined): number | null {
  const n = typeof area === 'string' ? Number(area) : area
  if (n == null || !Number.isFinite(n) || n <= 0) return null
  const factor = HECTARES_PER_UNIT[(unit ?? '').trim().toLowerCase()]
  return factor === undefined ? null : Math.round(n * factor * 1000) / 1000
}
