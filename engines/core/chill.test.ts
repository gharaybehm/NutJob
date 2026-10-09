import { describe, expect, it } from 'vitest'
import {
  chillHours,
  chillPortionsDynamic,
  chillUnitsUtah,
  growingDegreeHour,
  growingDegreeHours,
  hourlyFromDaily,
} from './chill'

const constant = (t: number, hours: number) => Array.from({ length: hours }, () => t)
const last = (xs: number[]) => xs[xs.length - 1]

describe('chillPortionsDynamic', () => {
  // Acceptance tests A4.4.
  it('gives about 7.8 portions for 240 h at 6 °C', () => {
    expect(Math.abs(last(chillPortionsDynamic(constant(6, 240))) - 7.8)).toBeLessThan(0.15)
  })

  it('gives no portions for 240 h at 15 °C', () => {
    expect(last(chillPortionsDynamic(constant(15, 240)))).toBe(0)
  })

  it('returns a cumulative, non-decreasing series of the same length', () => {
    const cp = chillPortionsDynamic(constant(4, 100))
    expect(cp).toHaveLength(100)
    for (let i = 1; i < cp.length; i++) expect(cp[i]).toBeGreaterThanOrEqual(cp[i - 1])
  })
})

describe('chillUnitsUtah', () => {
  it('follows the Richardson et al. 1974 steps', () => {
    expect(chillUnitsUtah([1, 2, 5, 10, 14, 17, 20])).toEqual([0, 0.5, 1.5, 2, 2, 1.5, 0.5])
  })
})

describe('chillHours', () => {
  it('counts hours below 7.2 °C', () => {
    expect(chillHours([7.1, 7.2, 0, -3, 12])).toEqual([1, 1, 2, 3, 3])
  })
})

describe('growing degree hours', () => {
  const p = { baseC: 4, optimumC: 25, criticalC: 36 }

  it('is zero at or below base and at or above critical', () => {
    expect(growingDegreeHour(4, p)).toBe(0)
    expect(growingDegreeHour(-2, p)).toBe(0)
    expect(growingDegreeHour(36, p)).toBeCloseTo(0, 10)
    expect(growingDegreeHour(40, p)).toBe(0)
  })

  it('peaks at the optimum with optimum - base', () => {
    expect(growingDegreeHour(25, p)).toBeCloseTo(21, 10)
  })

  it('is half the peak midway between base and optimum', () => {
    expect(growingDegreeHour(14.5, p)).toBeCloseTo(10.5, 10)
  })

  it('accumulates', () => {
    expect(last(growingDegreeHours([25, 25, 4], p))).toBeCloseTo(42, 10)
  })

  it('rejects cardinal temperatures out of order', () => {
    expect(() => growingDegreeHour(10, { baseC: 25, optimumC: 4, criticalC: 36 })).toThrow()
  })
})

describe('hourlyFromDaily', () => {
  it('rebuilds 24 hours per day within the daily range and flags the result', () => {
    const r = hourlyFromDaily([{ tminC: 2, tmaxC: 14 }, { tminC: -1, tmaxC: 9 }])
    expect(r.reconstructed).toBe(true)
    expect(r.temps).toHaveLength(48)
    const day1 = r.temps.slice(0, 24)
    expect(Math.max(...day1)).toBeCloseTo(14, 10)
    expect(Math.min(...day1)).toBeCloseTo(2, 10)
    expect(day1.reduce((a, b) => a + b, 0) / 24).toBeCloseTo(8, 10)
  })
})
