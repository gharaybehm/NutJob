/**
 * Decision tables with a first-hit policy (CDSS spec §A5.4).
 *
 * Rows are checked top to bottom and the first matching row fires. A
 * condition is a state key plus an optional operator suffix:
 *
 *   key        equals        (number, boolean, text, or a `$parameter`)
 *   key_ge     >=            key_gt   >
 *   key_le     <=            key_lt   <
 *   key_in     one of a list
 *
 * The right-hand side of a comparison is a number or an expression over
 * state keys and `$parameters`. `when: {}` always matches. A row that needs
 * a value the state does not have cannot fire; it is listed in the trace so
 * the caller can lower confidence and ask for the observation.
 */

import {
  evaluateExpression,
  ExpressionSyntaxError,
  MissingValueError,
  parseExpression,
  references,
  type ExpressionScope,
} from './expression'

export type ConditionValue = number | boolean | string | (number | string)[]

export interface DecisionRow {
  id: string
  when: Record<string, ConditionValue>
  /** The action and its details. `amount`, when text, is an expression. */
  then: Record<string, unknown>
  evidence?: string
}

export interface DecisionTable {
  table: string
  hit_policy: 'first'
  rows: DecisionRow[]
}

export type Operator = 'eq' | 'ge' | 'gt' | 'le' | 'lt' | 'in'

const SUFFIXES: [string, Operator][] = [
  ['_ge', 'ge'],
  ['_gt', 'gt'],
  ['_le', 'le'],
  ['_lt', 'lt'],
  ['_in', 'in'],
]

/** Splits a condition key into the state key and the operator. */
export function parseConditionKey(key: string): { stateKey: string; operator: Operator } {
  for (const [suffix, operator] of SUFFIXES) {
    if (key.endsWith(suffix) && key.length > suffix.length) {
      return { stateKey: key.slice(0, -suffix.length), operator }
    }
  }
  return { stateKey: key, operator: 'eq' }
}

export interface TableTrace {
  table: string
  /** The row that fired; null when no row matched. */
  rowId: string | null
  then: Record<string, unknown> | null
  /** The evaluated `amount`, when the fired row has one. */
  amount: number | null
  evidence: string | null
  /** State values the fired row read. */
  inputs: Record<string, unknown>
  /** Parameter values the fired row read. */
  params: Record<string, number>
  /** Earlier rows that could not be evaluated, with what was missing. */
  skipped: { rowId: string; missing: string[] }[]
}

type Outcome = { result: boolean } | { missing: string }

function numeric(value: ConditionValue, scope: ExpressionScope, used: Used): number {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') throw new ExpressionSyntaxError('a comparison needs a number or an expression')
  const expr = parseExpression(value)
  const refs = references(expr)
  const result = evaluateExpression(expr, scope)
  for (const name of refs.state) used.inputs[name] = scope.state[name]
  for (const name of refs.params) used.params[name] = scope.params[name] as number
  return result
}

interface Used {
  inputs: Record<string, unknown>
  params: Record<string, number>
}

function checkCondition(key: string, value: ConditionValue, scope: ExpressionScope, used: Used): Outcome {
  const { stateKey, operator } = parseConditionKey(key)
  const actual = scope.state[stateKey]
  if (actual === undefined || actual === null || (typeof actual === 'number' && Number.isNaN(actual))) {
    return { missing: stateKey }
  }
  used.inputs[stateKey] = actual

  try {
    if (operator === 'in') {
      if (!Array.isArray(value)) throw new ExpressionSyntaxError(`${key} needs a list`)
      return { result: value.some(v => v === actual) }
    }
    if (operator === 'eq') {
      if (typeof value === 'string' && value.startsWith('$')) return { result: actual === numeric(value, scope, used) }
      return { result: actual === value }
    }
    if (typeof actual !== 'number') return { missing: `${stateKey} as a number` }
    const expected = numeric(value, scope, used)
    if (operator === 'ge') return { result: actual >= expected }
    if (operator === 'gt') return { result: actual > expected }
    if (operator === 'le') return { result: actual <= expected }
    return { result: actual < expected }
  } catch (e) {
    if (e instanceof MissingValueError) return { missing: e.reference }
    throw e
  }
}

/** Evaluates a table against a block's state and the parameter values in force. */
export function evaluateTable(table: DecisionTable, scope: ExpressionScope): TableTrace {
  const skipped: TableTrace['skipped'] = []

  for (const row of table.rows) {
    const used: Used = { inputs: {}, params: {} }
    const missing: string[] = []
    let failed = false
    for (const [key, value] of Object.entries(row.when)) {
      const outcome = checkCondition(key, value, scope, used)
      if ('missing' in outcome) missing.push(outcome.missing)
      else if (!outcome.result) {
        failed = true
        break
      }
    }
    if (failed) continue

    let amount: number | null = null
    if (missing.length === 0 && row.then.amount !== undefined) {
      try {
        amount = numeric(row.then.amount as ConditionValue, scope, used)
      } catch (e) {
        if (!(e instanceof MissingValueError)) throw e
        missing.push(e.reference)
      }
    }
    if (missing.length > 0) {
      skipped.push({ rowId: row.id, missing: [...new Set(missing)] })
      continue
    }

    return {
      table: table.table,
      rowId: row.id,
      then: row.then,
      amount,
      evidence: row.evidence ?? null,
      inputs: used.inputs,
      params: used.params,
      skipped,
    }
  }

  return { table: table.table, rowId: null, then: null, amount: null, evidence: null, inputs: {}, params: {}, skipped }
}

/** Everything a table refers to, for pack validation (V2 and V5). */
export function tableReferences(table: DecisionTable): {
  params: string[]
  phases: string[]
  evidence: string[]
  errors: string[]
} {
  const params = new Set<string>()
  const phases = new Set<string>()
  const evidence = new Set<string>()
  const errors: string[] = []

  const collect = (rowId: string, text: string) => {
    try {
      for (const p of references(parseExpression(text)).params) params.add(p)
    } catch (e) {
      errors.push(`${table.table} row ${rowId}: ${(e as Error).message}`)
    }
  }

  for (const row of table.rows) {
    if (row.evidence) evidence.add(row.evidence)
    for (const [key, value] of Object.entries(row.when)) {
      const { stateKey, operator } = parseConditionKey(key)
      if (stateKey === 'phase') {
        for (const v of Array.isArray(value) ? value : [value]) phases.add(String(v))
        continue
      }
      if (operator === 'in') {
        if (!Array.isArray(value)) errors.push(`${table.table} row ${row.id}: ${key} needs a list`)
        continue
      }
      if (typeof value !== 'string') continue
      if (operator === 'eq') {
        if (value.startsWith('$')) collect(row.id, value)
      } else {
        collect(row.id, value)
      }
    }
    if (typeof row.then.amount === 'string') collect(row.id, row.then.amount)
  }
  return { params: [...params], phases: [...phases], evidence: [...evidence], errors }
}
