/**
 * Name matching and suggestion helpers for the block form and the engines. The
 * crop-specific lists live in the crop registry (utils/crops.ts). Suggestions
 * only: any text is accepted, saved as typed, and suggested again the next time
 * from the blocks already on the farm.
 */

/**
 * A name reduced for comparison: no accents, trademark signs, brackets or
 * punctuation, lower case. So "Vairo®", "VAIRO (IRTA)" and "vairo" match, and
 * "Ferragnès" matches "Ferragnes".
 */
export function optionKey(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[®™©]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
}

const PLACEHOLDERS = new Set(['', 'unknown', 'none', 'n a', 'na'])

/** Lists joined in order, without repeats (compared by optionKey) and without placeholders. */
export function mergeOptions(...lists: (string[] | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) {
    for (const raw of list ?? []) {
      const value = (raw ?? '').trim()
      const key = optionKey(value)
      if (PLACEHOLDERS.has(key) || seen.has(key)) continue
      seen.add(key)
      out.push(value)
    }
  }
  return out
}

export function isKnownOption(value: string, options: string[]): boolean {
  const key = optionKey(value)
  return key !== '' && options.some(o => optionKey(o) === key)
}

/**
 * Values already used on this farm's blocks, most used first, so what one user
 * typed is suggested to the next. `cropType`, when given, keeps a variety list
 * to the same crop.
 */
export function usedValues(
  blocks: { cropType?: string | null; variety?: string | null; rootstock?: string | null }[],
  field: 'variety' | 'rootstock',
  cropType?: string | null,
): string[] {
  const crop = optionKey(cropType)
  const counts = new Map<string, { value: string; n: number }>()
  for (const b of blocks) {
    if (crop && optionKey(b.cropType) !== crop) continue
    const value = (b[field] ?? '').trim()
    const key = optionKey(value)
    if (PLACEHOLDERS.has(key)) continue
    const cur = counts.get(key)
    if (cur) cur.n += 1
    else counts.set(key, { value, n: 1 })
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.value.localeCompare(b.value)).map(c => c.value)
}
