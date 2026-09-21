/**
 * Choosing, checking and describing soil and water lab tests for the AI context
 * and the screens. Pure.
 *
 * Why this exists: a farm-wide test (no block) used to be skipped entirely, the
 * same lab report could be saved several times with different values with
 * nothing to say which was right, and phosphorus and potassium (entered in
 * kg/da) reached the AI labelled "ppm".
 */
import { getBenchmark } from './soil-benchmarks'

export interface LabTestRow {
  id?: string
  block_id: string | null
  farm_id: string | null
  test_type: string | null
  recorded_at: string
  created_at?: string | null
  lab_reference: string | null
  ph: number | null
  soil_ec: number | null
  parameters: Record<string, unknown> | null
}

export type LabScope = 'block' | 'farm'

export interface LabConflict {
  reference: string
  /** How many saved records share the reference in the chosen scope. */
  count: number
  /** Fields that hold different values across those records. */
  fields: string[]
}

export interface PickedLabTest {
  row: LabTestRow | null
  scope: LabScope | null
  conflicts: LabConflict[]
}

const newestFirst = (a: LabTestRow, b: LabTestRow) =>
  b.recorded_at.localeCompare(a.recorded_at) ||
  (b.created_at ?? '').localeCompare(a.created_at ?? '') ||
  (b.id ?? '').localeCompare(a.id ?? '')

const sameRef = (a: string | null, b: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

function flatten(r: LabTestRow): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(r.parameters ?? {}) }
  if (r.ph != null) out.ph = r.ph
  if (r.soil_ec != null) out.soil_ec = r.soil_ec
  return out
}

function differingFields(rows: LabTestRow[]): string[] {
  const flat = rows.map(flatten)
  const keys = new Set(flat.flatMap(f => Object.keys(f)))
  const fields: string[] = []
  for (const k of keys) {
    const present = flat.map(f => f[k]).filter(v => v !== undefined && v !== null && v !== '')
    if (present.length < 2) continue // present in only one record is a gap, not a conflict
    const differs = present.some(v =>
      typeof v === 'number' && typeof present[0] === 'number'
        ? Math.abs(v - (present[0] as number)) > 1e-9
        : String(v).trim().toLowerCase() !== String(present[0]).trim().toLowerCase(),
    )
    if (differs) fields.push(k)
  }
  return fields.sort()
}

/**
 * The test that describes a block: its own latest test, else the farm-wide one.
 * A block's own test is preferred even when a farm-wide one is newer, because it
 * represents that block better. Records that share the chosen record's lab
 * reference and disagree are reported as a conflict.
 */
export function pickLabTest(
  rows: LabTestRow[],
  opts: { blockId: string; farmId: string | null; testType: 'soil' | 'water' },
): PickedLabTest {
  const ofType = rows.filter(r => (r.test_type ?? 'soil') === opts.testType)
  const own = ofType.filter(r => r.block_id === opts.blockId).sort(newestFirst)
  const farmWide = opts.farmId
    ? ofType.filter(r => r.block_id === null && r.farm_id === opts.farmId).sort(newestFirst)
    : []

  const pool = own.length > 0 ? own : farmWide
  const scope: LabScope | null = own.length > 0 ? 'block' : farmWide.length > 0 ? 'farm' : null
  const row = pool[0] ?? null
  if (!row || !scope) return { row: null, scope: null, conflicts: [] }

  const conflicts: LabConflict[] = []
  if (row.lab_reference) {
    const same = pool.filter(r => sameRef(r.lab_reference, row.lab_reference))
    if (same.length > 1) {
      const fields = differingFields(same)
      if (fields.length > 0) conflicts.push({ reference: row.lab_reference.trim(), count: same.length, fields })
    }
  }
  return { row, scope, conflicts }
}

// ─── Consistency checks ──────────────────────────────────────────────────────

const CA_MG_PER_MEQ = { calcium: 20.04, magnesium: 12.15 } // mg per meq

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Sanity checks on one test's numbers. Each string is a reason to distrust the record. */
export function checkLabConsistency(row: LabTestRow): string[] {
  const p = row.parameters ?? {}
  const flags: string[] = []

  const sand = num(p.sand), clay = num(p.clay), silt = num(p.silt)
  if (sand !== null && clay !== null && silt !== null) {
    const sum = sand + clay + silt
    if (sum < 98 || sum > 102) flags.push(`Sand, clay and silt add up to ${Math.round(sum * 10) / 10}%, not 100%: check the texture figures.`)
  }

  const ca = num(p.calcium), mg = num(p.magnesium), cec = num(p.cec)
  if (ca !== null && mg !== null && cec !== null && cec > 0) {
    // ppm (mg/kg) to meq/100 g: divide by the equivalent weight, then by 10.
    const meq = ca / (CA_MG_PER_MEQ.calcium * 10) + mg / (CA_MG_PER_MEQ.magnesium * 10)
    if (meq > 1.5 * cec) {
      flags.push(
        `Calcium and magnesium come to about ${Math.round(meq * 10) / 10} meq/100 g, more than the CEC of ${cec}: the CEC or the Ca and Mg values are suspect. ` +
          `In soil with a lot of lime, ammonium-acetate calcium and magnesium can be overstated.`,
      )
    }
  }
  return flags
}

// ─── Description for the AI ──────────────────────────────────────────────────

/** [parameters key, label, unit, benchmark key] */
const PARAM_LINES: [string, string, string, string?][] = [
  ['organic_matter', 'Organic matter', '%', 'organic_matter'],
  ['phosphorus_p2o5', 'P2O5 (Olsen)', 'kg/da', 'phosphorus'],
  ['potassium_k2o', 'K2O', 'kg/da', 'potassium'],
  ['lime', 'Lime (CaCO3)', '%', 'lime'],
  ['calcium', 'Calcium', 'ppm', 'calcium'],
  ['magnesium', 'Magnesium', 'ppm', 'magnesium'],
  ['sodium', 'Sodium', 'ppm'],
  ['iron', 'Iron', 'ppm', 'iron'],
  ['zinc', 'Zinc', 'ppm', 'zinc'],
  ['copper', 'Copper', 'ppm', 'copper'],
  ['manganese', 'Manganese', 'ppm', 'manganese'],
  ['boron', 'Boron', 'mg/kg', 'boron'],
  ['cec', 'CEC', 'meq/100 g', 'cec'],
  ['sand', 'Sand', '%'],
  ['clay', 'Clay', '%'],
  ['silt', 'Silt', '%'],
]

function describe(label: string, v: number, unit: string, benchKey?: string): string {
  const b = benchKey ? getBenchmark(benchKey, v) : null
  return `${label} ${v}${unit ? ` ${unit}` : ''}${b && b.label ? ` (${b.label})` : ''}`
}

/** Every recorded parameter with its real unit and reference band. */
export function describeLabTest(row: LabTestRow): string[] {
  const p = row.parameters ?? {}
  const parts: string[] = []
  if (row.ph != null) parts.push(describe('pH', row.ph, '', 'ph'))
  if (row.soil_ec != null) parts.push(describe('EC', row.soil_ec, 'mS/cm', 'ec_soil'))
  for (const [key, label, unit, bench] of PARAM_LINES) {
    const v = num(p[key])
    if (v !== null) parts.push(describe(label, v, unit, bench))
  }
  if (typeof p.texture_class === 'string' && p.texture_class.trim()) parts.push(`Texture ${p.texture_class.trim()}`)
  return parts
}

export function describeConflict(c: LabConflict): string {
  return `${c.count} saved records share lab reference ${c.reference} but disagree on ${c.fields.join(', ')}: the newest is shown, verify against the paper report.`
}
