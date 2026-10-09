import { describe, expect, it } from 'vitest'
import {
  evaluateExpression,
  ExpressionSyntaxError,
  isExpression,
  MissingValueError,
  parseExpression,
  references,
} from './expression'
import { evaluateTable, parseConditionKey, tableReferences, type DecisionTable } from './table'

const calc = (source: string, state: Record<string, unknown> = {}, params: Record<string, number | null> = {}) =>
  evaluateExpression(parseExpression(source), { state, params })

describe('expressions', () => {
  it('follows the usual precedence and brackets', () => {
    expect(calc('1 + 2 * 3')).toBe(7)
    expect(calc('(1 + 2) * 3')).toBe(9)
    expect(calc('10 - 4 - 3')).toBe(3)
    expect(calc('8 / 4 / 2')).toBe(1)
    expect(calc('-2 * -3')).toBe(6)
  })

  it('reads state keys and $parameters', () => {
    expect(calc('Dr / efficiency * (1 + leaching_fraction)', { Dr: 60, efficiency: 0.8, leaching_fraction: 0.1 })).toBeCloseTo(82.5, 10)
    expect(calc('$fraction * ETc_since_last', { ETc_since_last: 30 }, { fraction: 0.5 })).toBe(15)
    expect(calc('-$trigger', {}, { trigger: 3.5 })).toBe(-3.5)
    expect(calc('$flight - 150', {}, { flight: 1056 })).toBe(906)
  })

  it('names what is missing', () => {
    expect(() => calc('Dr / efficiency', { Dr: 60 })).toThrow(MissingValueError)
    expect(() => calc('$p * 2', {}, { p: null })).toThrow(/\$p/)
    expect(() => calc('a / b', { a: 1, b: 0 })).toThrow(MissingValueError)
    expect(() => calc('a + 1', { a: 'text' })).toThrow(MissingValueError)
  })

  it('rejects text that is not an expression', () => {
    expect(() => parseExpression('1 +')).toThrow(ExpressionSyntaxError)
    expect(() => parseExpression('(1 + 2')).toThrow(ExpressionSyntaxError)
    expect(() => parseExpression('a b')).toThrow(ExpressionSyntaxError)
    expect(() => parseExpression('a; b')).toThrow(ExpressionSyntaxError)
    expect(isExpression('process.exit()')).toBe(false)
    expect(isExpression('RAW')).toBe(true)
  })

  it('lists what an expression refers to', () => {
    expect(references(parseExpression('$a * Dr + $a - RAW / $b'))).toEqual({ state: ['Dr', 'RAW'], params: ['a', 'b'] })
  })
})

describe('condition keys', () => {
  it('splits the operator suffix from the state key', () => {
    expect(parseConditionKey('Dr_ge')).toEqual({ stateKey: 'Dr', operator: 'ge' })
    expect(parseConditionKey('rain_prob_ge')).toEqual({ stateKey: 'rain_prob', operator: 'ge' })
    expect(parseConditionKey('phase_in')).toEqual({ stateKey: 'phase', operator: 'in' })
    expect(parseConditionKey('phase')).toEqual({ stateKey: 'phase', operator: 'eq' })
    expect(parseConditionKey('enabled')).toEqual({ stateKey: 'enabled', operator: 'eq' })
  })
})

describe('decision tables', () => {
  const table: DecisionTable = {
    table: 'demo',
    hit_policy: 'first',
    rows: [
      { id: 'R0', when: { phase: 'resting' }, then: { action: 'none' } },
      { id: 'R1', when: { rain_ge: 'Dr', rain_prob_ge: '$defer' }, then: { action: 'defer' }, evidence: 'SRC_A' },
      { id: 'R2', when: { phase_in: ['growing', 'filling'], Dr_ge: 'RAW' }, then: { action: 'irrigate', amount: 'Dr / efficiency' }, evidence: 'SRC_A' },
      { id: 'R3', when: { reading_le: '-$trigger', Dr_lt: 'RAW' }, then: { action: 'irrigate', amount: 'Dr', flag: 'DIVERGENCE' } },
      { id: 'R4', when: {}, then: { action: 'hold' } },
    ],
  }
  const params = { defer: 0.7, trigger: 3.5 }
  const state = { phase: 'growing', rain: 0, rain_prob: 0, Dr: 60, RAW: 50, efficiency: 0.8, reading: -1 }

  it('fires the first matching row and evaluates its amount', () => {
    const r = evaluateTable(table, { state, params })
    expect(r.rowId).toBe('R2')
    expect(r.then).toMatchObject({ action: 'irrigate' })
    expect(r.amount).toBeCloseTo(75, 10)
    expect(r.evidence).toBe('SRC_A')
  })

  it('checks rows top to bottom', () => {
    expect(evaluateTable(table, { state: { ...state, phase: 'resting' }, params }).rowId).toBe('R0')
    expect(evaluateTable(table, { state: { ...state, rain: 80, rain_prob: 0.9 }, params }).rowId).toBe('R1')
    expect(evaluateTable(table, { state: { ...state, Dr: 20 }, params }).rowId).toBe('R4')
    expect(evaluateTable(table, { state: { ...state, Dr: 20, reading: -4 }, params }).rowId).toBe('R3')
  })

  it('records the inputs and parameter values the fired row used', () => {
    const r = evaluateTable(table, { state: { ...state, Dr: 20, reading: -4 }, params })
    expect(r.inputs).toEqual({ reading: -4, Dr: 20, RAW: 50 })
    expect(r.params).toEqual({ trigger: 3.5 })
  })

  it('skips a row whose input is missing and says what was missing', () => {
    const { rain_prob: _unused, ...withoutProb } = state
    void _unused
    const r = evaluateTable(table, { state: { ...withoutProb, rain: 80 }, params })
    expect(r.rowId).toBe('R2')
    expect(r.skipped).toEqual([{ rowId: 'R1', missing: ['rain_prob'] }])
  })

  it('does not report a row as skipped when a known condition already fails', () => {
    const r = evaluateTable(table, { state: { phase: 'growing', rain: 0, Dr: 60, RAW: 50, efficiency: 0.8, reading: -1 }, params })
    expect(r.rowId).toBe('R2')
    expect(r.skipped).toEqual([])
  })

  it('cannot fire a row whose parameter has not been sourced', () => {
    const r = evaluateTable(table, { state: { ...state, rain: 80, rain_prob: 0.9 }, params: { ...params, defer: null } })
    expect(r.rowId).toBe('R2')
    expect(r.skipped).toEqual([{ rowId: 'R1', missing: ['$defer'] }])
  })

  it('cannot fire a row whose amount cannot be computed', () => {
    const { efficiency: _unused, ...withoutEfficiency } = state
    void _unused
    const r = evaluateTable(table, { state: withoutEfficiency, params })
    expect(r.rowId).toBe('R4')
    expect(r.skipped).toEqual([{ rowId: 'R2', missing: ['efficiency'] }])
  })

  it('returns no row when nothing matches and there is no catch-all', () => {
    const r = evaluateTable({ ...table, rows: table.rows.slice(0, 1) }, { state, params })
    expect(r.rowId).toBeNull()
    expect(r.then).toBeNull()
  })

  it('compares booleans and $parameters by equality', () => {
    const t: DecisionTable = {
      table: 'eq',
      hit_policy: 'first',
      rows: [
        { id: 'A', when: { enabled: true, count: '$target' }, then: { action: 'a' } },
        { id: 'B', when: {}, then: { action: 'b' } },
      ],
    }
    expect(evaluateTable(t, { state: { enabled: true, count: 2 }, params: { target: 2 } }).rowId).toBe('A')
    expect(evaluateTable(t, { state: { enabled: false, count: 2 }, params: { target: 2 } }).rowId).toBe('B')
  })

  it('lists parameters, phases and evidence for validation', () => {
    const refs = tableReferences(table)
    expect(refs.params.sort()).toEqual(['defer', 'trigger'])
    expect(refs.phases.sort()).toEqual(['filling', 'growing', 'resting'])
    expect(refs.evidence).toEqual(['SRC_A'])
    expect(refs.errors).toEqual([])
  })

  it('reports a condition that does not parse', () => {
    const bad: DecisionTable = { table: 'bad', hit_policy: 'first', rows: [{ id: 'X', when: { Dr_ge: 'RAW +' }, then: {} }] }
    expect(tableReferences(bad).errors).toHaveLength(1)
  })
})
