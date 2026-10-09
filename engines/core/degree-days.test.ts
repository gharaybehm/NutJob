import { describe, expect, it } from 'vitest'
import { accumulateDegreeDays, degreeDays, degreeDaysFromCelsius, type DegreeDayModel } from './degree-days'
import { fToC } from './units'

const sine = { method: 'single_sine', cutoff: 'horizontal', lower: 43, upper: 78 } as const

describe('single sine, horizontal cutoff', () => {
  // Acceptance tests A4.3: UC IPM published table, thresholds 43/78 °F.
  it.each([
    [60, 48, 11],
    [60, 34, 6],
    [72, 34, 12],
    [50, 34, 2],
    [66, 40, 10],
  ])('tmax %d, tmin %d gives %d', (tmax, tmin, expected) => {
    expect(Math.round(degreeDays(tmin, tmax, sine))).toBe(expected)
  })

  it('is continuous across each threshold boundary', () => {
    const eps = 1e-4
    const cases: [number, number][] = [
      [43, 60], // tmin at lower
      [30, 43], // tmax at lower
      [50, 78], // tmax at upper
      [78, 90], // tmin at upper
      [43, 78], // both
    ]
    for (const [tmin, tmax] of cases) {
      for (const [dMin, dMax] of [[eps, 0], [0, eps], [-eps, 0], [0, -eps]]) {
        const a = degreeDays(tmin, tmax, sine)
        const b = degreeDays(tmin + dMin, tmax + dMax, sine)
        expect(Math.abs(a - b)).toBeLessThan(0.01)
      }
    }
  })

  it('is zero below the lower threshold and capped above the upper', () => {
    expect(degreeDays(20, 40, sine)).toBe(0)
    expect(degreeDays(80, 95, sine)).toBe(35)
  })

  it('rejects a maximum below the minimum', () => {
    expect(() => degreeDays(60, 50, sine)).toThrow(/tmax < tmin/)
  })
})

describe('other methods', () => {
  it('single triangle: area of the triangle above the lower threshold', () => {
    // tmin 40, tmax 60, lower 50: (60 - 50)^2 / (2 * 20) = 2.5
    expect(degreeDays(40, 60, { method: 'single_triangle', cutoff: 'horizontal', lower: 50, upper: null })).toBeCloseTo(2.5, 10)
    // entirely above the lower threshold: mean - lower
    expect(degreeDays(55, 65, { method: 'single_triangle', cutoff: 'horizontal', lower: 50, upper: null })).toBe(10)
  })

  it('single triangle with a horizontal upper cutoff', () => {
    // tmin 40, tmax 60, lower 50, upper 55: 2.5 - (60 - 55)^2 / 40 = 1.875
    expect(degreeDays(40, 60, { method: 'single_triangle', cutoff: 'horizontal', lower: 50, upper: 55 })).toBeCloseTo(1.875, 10)
  })

  it('averaging: mean minus lower, capped at the upper threshold', () => {
    expect(degreeDays(40, 70, { method: 'averaging', cutoff: 'horizontal', lower: 50, upper: 80 })).toBe(5)
    expect(degreeDays(40, 50, { method: 'averaging', cutoff: 'horizontal', lower: 50, upper: 80 })).toBe(0)
    expect(degreeDays(80, 100, { method: 'averaging', cutoff: 'horizontal', lower: 50, upper: 80 })).toBe(30)
  })
})

describe('cutoffs', () => {
  it('agree when the day stays below the upper threshold', () => {
    for (const cutoff of ['horizontal', 'vertical', 'intermediate'] as const) {
      expect(degreeDays(48, 60, { ...sine, cutoff })).toBeCloseTo(11, 10)
    }
  })

  it('order as vertical <= intermediate <= horizontal on a hot day', () => {
    const h = degreeDays(60, 95, { ...sine, cutoff: 'horizontal' })
    const i = degreeDays(60, 95, { ...sine, cutoff: 'intermediate' })
    const v = degreeDays(60, 95, { ...sine, cutoff: 'vertical' })
    expect(v).toBeLessThan(i)
    expect(i).toBeLessThan(h)
    expect(v).toBeGreaterThanOrEqual(0)
  })

  it('vertical cutoff counts nothing when the whole day is above the upper threshold', () => {
    expect(degreeDays(80, 95, { ...sine, cutoff: 'vertical' })).toBe(0)
  })
})

describe('units', () => {
  const model: DegreeDayModel = { ...sine, units: 'F' }

  it('converts stored °C to the model units at the boundary', () => {
    expect(Math.round(degreeDaysFromCelsius(fToC(48), fToC(60), model))).toBe(11)
  })

  it('accumulates over days', () => {
    const days = [
      { tminC: fToC(48), tmaxC: fToC(60) },
      { tminC: fToC(34), tmaxC: fToC(72) },
    ]
    expect(accumulateDegreeDays(days, model)).toBeCloseTo(degreeDays(48, 60, sine) + degreeDays(34, 72, sine), 8)
  })
})
