import { describe, expect, it } from 'vitest'
import { getBenchmark } from './soil-benchmarks'

describe('getBenchmark', () => {
  it('grades the values of the real Sultanhani report', () => {
    const g = (k: string, v: number) => `${getBenchmark(k, v).status}:${getBenchmark(k, v).label}`
    expect(g('ph', 8.17)).toBe('amber:Slightly Alkaline')
    expect(g('ec_soil', 0.836)).toBe('green:Non-saline')
    expect(g('organic_matter', 2.07)).toBe('green:Medium')
    expect(g('phosphorus', 11.1)).toBe('green:High')
    expect(g('potassium', 191.62)).toBe('amber:Very High')
    expect(g('lime', 29.26)).toBe('red:Extremely Calcareous')
    expect(g('iron', 2.08)).toBe('red:Deficient')
    expect(g('zinc', 0.72)).toBe('amber:Marginal')
    expect(g('copper', 1.72)).toBe('green:Sufficient')
    expect(g('manganese', 9.14)).toBe('green:Sufficient')
    expect(g('boron', 0.099)).toBe('red:Deficient')
  })

  it('accepts the aliases the history tab uses', () => {
    expect(getBenchmark('ph_soil', 8.17)).toEqual(getBenchmark('ph', 8.17))
    expect(getBenchmark('ph_water', 7.5).status).toBe('green')
  })

  it('returns a neutral result for an unknown key', () => {
    expect(getBenchmark('nitrogen', 12)).toEqual({ status: 'green', label: '' })
  })
})
