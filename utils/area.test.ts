import { describe, expect, it } from 'vitest'
import { toHectares } from './area'

describe('toHectares', () => {
  it('converts dunum, acre and hectare', () => {
    expect(toHectares(20, 'Dunm')).toBe(2)
    expect(toHectares(10, 'Acre')).toBeCloseTo(4.047, 3)
    expect(toHectares(3, 'Hectare')).toBe(3)
  })

  it('accepts numeric strings (numeric columns arrive as strings) and any case', () => {
    expect(toHectares('50', 'dunm')).toBe(5)
  })

  it('returns null rather than guessing for a missing, non-positive or unknown value', () => {
    expect(toHectares(null, 'Dunm')).toBeNull()
    expect(toHectares(0, 'Dunm')).toBeNull()
    expect(toHectares(10, 'furlong')).toBeNull()
    expect(toHectares(10, null)).toBeNull()
  })
})
