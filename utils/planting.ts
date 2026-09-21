/**
 * Reads the planting fields of the block form. A block needs a planting date or
 * at least a year: the app used to save the current year silently when both were
 * empty, which made every such block look newly planted.
 */

export type PlantingResolution =
  | { ok: true; date: string | null; year: number }
  | { ok: false; error: string }

const MIN_YEAR = 1900

export function resolvePlanting(
  dateInput: string | null | undefined,
  yearInput: string | number | null | undefined,
  now: Date = new Date(),
): PlantingResolution {
  const maxYear = now.getUTCFullYear() + 1
  const date = typeof dateInput === 'string' ? dateInput.trim() : ''

  if (date !== '') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
    const parsed = m ? new Date(`${date}T00:00:00Z`) : null
    if (!m || !parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      return { ok: false, error: 'Planting date must be a real date (YYYY-MM-DD).' }
    }
    const year = Number(m[1])
    if (year < MIN_YEAR || year > maxYear) return { ok: false, error: `Planting date must be between ${MIN_YEAR} and ${maxYear}.` }
    return { ok: true, date, year }
  }

  const raw = typeof yearInput === 'number' ? String(yearInput) : (yearInput ?? '').toString().trim()
  if (raw === '') return { ok: false, error: 'Enter the planting date, or at least the planting year.' }
  const year = Number(raw)
  if (!Number.isInteger(year) || year < MIN_YEAR || year > maxYear) {
    return { ok: false, error: `Planting year must be between ${MIN_YEAR} and ${maxYear}.` }
  }
  return { ok: true, date: null, year }
}
