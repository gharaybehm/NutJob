/**
 * Unit conversion at the model boundary (CDSS spec §A2, R2.4).
 *
 * The platform stores temperature in °C and pressure-like plant readings in
 * the unit the pack declares. A pack model may be defined in other units
 * (degree-days in °F, for example); values are converted here on the way in
 * and results are labelled with the model's units on the way out.
 */

export type TemperatureUnit = 'C' | 'F'

export function cToF(c: number): number {
  return (c * 9) / 5 + 32
}

export function fToC(f: number): number {
  return ((f - 32) * 5) / 9
}

/** Converts a temperature (not a temperature difference) between units. */
export function convertTemperature(value: number, from: TemperatureUnit, to: TemperatureUnit): number {
  if (from === to) return value
  return from === 'C' ? cToF(value) : fToC(value)
}

/** Converts a temperature difference or a degree-day total between units. */
export function convertTemperatureDifference(value: number, from: TemperatureUnit, to: TemperatureUnit): number {
  if (from === to) return value
  return from === 'C' ? (value * 9) / 5 : (value * 5) / 9
}

export function barToMPa(bar: number): number {
  return bar / 10
}

export function mPaToBar(mpa: number): number {
  return mpa * 10
}

/** Wind speed at 2 m from a measurement at another height (FAO-56 Eq. 47). */
export function windAt2m(speed: number, heightM: number): number {
  if (heightM <= 0.08) throw new Error('wind measurement height too low for FAO-56 Eq. 47')
  return (speed * 4.87) / Math.log(67.8 * heightM - 5.42)
}
