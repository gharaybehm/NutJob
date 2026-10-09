/**
 * What changed between two versions of a pack (CDSS spec §B4: the update
 * screen shows a diff of changed rules, parameters and models, and blocks
 * move to the new version only when the farm accepts).
 */

import { packTables } from './context'
import type { Pack } from './schema'

export interface ParameterChange {
  id: string
  /** What changed: the start value, the bounds, the unit or the status. */
  field: 'start' | 'bounds' | 'unit' | 'status'
  from: string
  to: string
}

export interface TableChange {
  table: string
  rowsAdded: string[]
  rowsRemoved: string[]
  rowsChanged: string[]
}

export interface PackDiff {
  packId: string
  fromVersion: string
  toVersion: string
  parameters: { added: string[]; removed: string[]; changed: ParameterChange[] }
  tables: TableChange[]
  tablesAdded: string[]
  tablesRemoved: string[]
  /** Sections whose content differs in any way, by name. */
  sections: string[]
  /** True when nothing differs but the version itself. */
  identical: boolean
}

const text = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v))
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Sections compared by content. The manifest always differs (version, signature) and the tests are not content. */
const SKIPPED = ['manifest', 'tests', 'parameters']

export function packDiff(from: Pack, to: Pack): PackDiff {
  const before = new Map(from.parameters.parameters.map(p => [p.id, p]))
  const after = new Map(to.parameters.parameters.map(p => [p.id, p]))
  const changed: ParameterChange[] = []
  for (const [id, a] of before) {
    const b = after.get(id)
    if (!b) continue
    for (const field of ['start', 'bounds', 'unit', 'status'] as const) {
      if (!same(a[field], b[field])) changed.push({ id, field, from: text(a[field]), to: text(b[field]) })
    }
  }

  const tablesBefore = packTables(from)
  const tablesAfter = packTables(to)
  const tables: TableChange[] = []
  for (const [name, a] of Object.entries(tablesBefore)) {
    const b = tablesAfter[name]
    if (!b) continue
    const rowsA = new Map(a.rows.map(r => [r.id, r]))
    const rowsB = new Map(b.rows.map(r => [r.id, r]))
    const change: TableChange = {
      table: name,
      rowsAdded: [...rowsB.keys()].filter(id => !rowsA.has(id)),
      rowsRemoved: [...rowsA.keys()].filter(id => !rowsB.has(id)),
      rowsChanged: [...rowsA.keys()].filter(id => rowsB.has(id) && !same(rowsA.get(id), rowsB.get(id))),
    }
    // A reordering changes which row fires first, so it counts as a change to the table.
    const reordered = !same([...rowsA.keys()].filter(id => rowsB.has(id)), [...rowsB.keys()].filter(id => rowsA.has(id)))
    if (change.rowsAdded.length + change.rowsRemoved.length + change.rowsChanged.length > 0 || reordered) {
      if (reordered && change.rowsChanged.length === 0) change.rowsChanged = ['(order of rows)']
      tables.push(change)
    }
  }

  const names = new Set([...Object.keys(from), ...Object.keys(to)].filter(k => !SKIPPED.includes(k)))
  const sections = [...names].filter(k => !same((from as Record<string, unknown>)[k], (to as Record<string, unknown>)[k])).sort()

  const parameters = {
    added: [...after.keys()].filter(id => !before.has(id)),
    removed: [...before.keys()].filter(id => !after.has(id)),
    changed,
  }
  const tablesAdded = Object.keys(tablesAfter).filter(t => !(t in tablesBefore))
  const tablesRemoved = Object.keys(tablesBefore).filter(t => !(t in tablesAfter))
  return {
    packId: to.manifest.id,
    fromVersion: from.manifest.version,
    toVersion: to.manifest.version,
    parameters,
    tables,
    tablesAdded,
    tablesRemoved,
    sections,
    identical: sections.length === 0 && parameters.added.length + parameters.removed.length + changed.length === 0,
  }
}

/** True when `a` is a later version than `b` (both as x.y.z). */
export function newerVersion(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i]
  return false
}
