/**
 * PackContext: an engine's read-only view of a block's pack (spec §A5.1).
 *
 * It holds the pack's decision tables, models and parameters, with the
 * farm's calibrated values applied on top. A calibrated value outside the
 * pack's declared bounds is not applied; it is held and reported for
 * agronomist review (R11.1). The pack itself is never modified.
 */

import { evaluateTable, type DecisionTable, type TableTrace } from '../rules/table'
import type { Pack, PackParameter } from './schema'

export interface HeldOverride {
  id: string
  value: number
  reason: string
}

export interface PackTableTrace extends TableTrace {
  packId: string
  packVersion: string
}

export interface PackContext {
  readonly pack: Pack
  readonly packId: string
  readonly packVersion: string
  /** Parameter values in force; null where the value is still to be sourced. */
  readonly params: Readonly<Record<string, number | null>>
  /** Ids whose value in force is a farm calibration, not the pack's start value. */
  readonly calibrated: readonly string[]
  /** Calibrated values that were not applied. */
  readonly held: readonly HeldOverride[]
  /** The value of a parameter; throws when it is unknown or not sourced yet. */
  param(id: string): number
  /** Resolves a `$parameter` reference from a pack section. */
  resolve(ref: string): number
  table(id: string): DecisionTable | null
  /** Evaluates a decision table against a block's state. */
  evaluate(tableId: string, state: Record<string, unknown>): PackTableTrace
}

/** Every decision table in a pack, by table id. */
export function packTables(pack: Pack): Record<string, DecisionTable> {
  const tables: Record<string, DecisionTable> = {}
  const add = (t: DecisionTable | undefined) => {
    if (t) tables[t.table] = t
  }
  add(pack.water?.decision_table)
  add(pack.nutrition?.decision_table)
  for (const pest of pack.pests?.pests ?? []) add(pest.decision_table)
  for (const disease of pack.diseases?.diseases ?? []) add(disease.decision_table)
  for (const coupling of pack.couplings?.couplings ?? []) add(coupling.decision_table)
  return tables
}

export function createPackContext(pack: Pack, overrides: Record<string, number> = {}): PackContext {
  const definitions = new Map<string, PackParameter>(pack.parameters.parameters.map(p => [p.id, p]))
  const params: Record<string, number | null> = {}
  for (const p of definitions.values()) params[p.id] = p.start

  const calibrated: string[] = []
  const held: HeldOverride[] = []
  for (const [id, value] of Object.entries(overrides)) {
    const def = definitions.get(id)
    if (!def) {
      held.push({ id, value, reason: 'The pack has no parameter with this id' })
    } else if (!def.bounds) {
      held.push({ id, value, reason: 'The pack declares no bounds for this parameter' })
    } else if (value < def.bounds[0] || value > def.bounds[1]) {
      held.push({ id, value, reason: `Outside the pack bounds ${def.bounds[0]} to ${def.bounds[1]} ${def.unit}` })
    } else {
      params[id] = value
      calibrated.push(id)
    }
  }

  const tables = packTables(pack)
  const packId = pack.manifest.id
  const packVersion = pack.manifest.version

  const param = (id: string): number => {
    if (!(id in params)) throw new Error(`pack ${packId} ${packVersion} has no parameter "${id}"`)
    const value = params[id]
    if (value === null) throw new Error(`parameter "${id}" in pack ${packId} ${packVersion} is still to be sourced`)
    return value
  }

  return {
    pack,
    packId,
    packVersion,
    params,
    calibrated,
    held,
    param,
    resolve(ref) {
      if (!ref.startsWith('$')) throw new Error(`"${ref}" is not a $parameter reference`)
      return param(ref.slice(1))
    },
    table: id => tables[id] ?? null,
    evaluate(tableId, state) {
      const table = tables[tableId]
      if (!table) throw new Error(`pack ${packId} ${packVersion} has no decision table "${tableId}"`)
      return { ...evaluateTable(table, { state, params }), packId, packVersion }
    },
  }
}
