import { describe, expect, it } from 'vitest'
import { et0PenmanMonteith, extraterrestrialRadiation } from './et0'
import pyet from './__fixtures__/et0-pyet.json'

describe('et0PenmanMonteith', () => {
  // Acceptance test A4.1: FAO-56 Example 18 (Brussels, 6 July), with sunshine hours.
  const example18 = {
    tmax: 21.5,
    tmin: 12.3,
    rhmax: 84,
    rhmin: 63,
    wind2m: 2.078,
    sunshineHours: 9.25,
    elevationM: 100,
    latitudeDeg: 50.8,
    dayOfYear: 187,
  }

  it('gives 3.9 mm/day for FAO-56 Example 18', () => {
    expect(Math.abs(et0PenmanMonteith(example18) - 3.9)).toBeLessThanOrEqual(0.1)
  })

  it('agrees with pyet on Example 18', () => {
    expect(et0PenmanMonteith(example18)).toBeCloseTo(pyet.example18.et0, 3)
  })

  it('reproduces the intermediate values of Example 18', () => {
    const { ra, daylightHours } = extraterrestrialRadiation(50.8, 187)
    expect(ra).toBeCloseTo(41.09, 1)
    expect(daylightHours).toBeCloseTo(16.1, 1)
  })

  it('agrees with pyet across a year of measured-radiation days', () => {
    const { latitude_deg, elevation_m, days } = pyet.series
    for (const d of days) {
      const et0 = et0PenmanMonteith({
        tmax: d.tmax,
        tmin: d.tmin,
        rhmax: d.rhmax,
        rhmin: d.rhmin,
        wind2m: d.wind_2m,
        rs: d.rs,
        elevationM: elevation_m,
        latitudeDeg: latitude_deg,
        dayOfYear: d.doy,
      })
      expect(Math.abs(et0 - d.et0), `${d.date}: ${et0} vs pyet ${d.et0}`).toBeLessThan(0.001)
    }
  })

  it('needs radiation or sunshine hours', () => {
    expect(() => et0PenmanMonteith({ ...example18, sunshineHours: undefined })).toThrow(/rs or sunshineHours/)
  })

  it('rejects a maximum below the minimum', () => {
    expect(() => et0PenmanMonteith({ ...example18, tmax: 5 })).toThrow(/tmax < tmin/)
  })
})
