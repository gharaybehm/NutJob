/**
 * Chill and heat accumulation (CDSS spec §A4.4).
 *
 * Three chill models and one heat model. The pack chooses which model each
 * variety's requirement is expressed in. The constants below belong to the
 * models themselves, not to any crop.
 */

/**
 * Dynamic Model chill portions (Fishman et al. 1987), as implemented in
 * chillR::Dynamic_Model. Returns the cumulative chill portions at each hour.
 */
export function chillPortionsDynamic(hourlyTempsC: number[]): number[] {
  const e0 = 4153.5
  const e1 = 12888.8
  const a0 = 139500.0
  const a1 = 2.567e18
  const slp = 1.6
  const tetmlt = 277.0
  const aa = a0 / a1
  const ee = e1 - e0
  let xPrev = 0
  let xiPrev = 0
  let cp = 0
  const out: number[] = []
  for (const t of hourlyTempsC) {
    const tk = t + 273.0
    const sr = Math.exp((slp * tetmlt * (tk - tetmlt)) / tk)
    const xi = sr / (1 + sr)
    const xs = aa * Math.exp(ee / tk)
    const ak1 = a1 * Math.exp(-e1 / tk)
    const s = xPrev < 1 ? xPrev : xPrev * (1 - xiPrev)
    const x = xs - (xs - s) * Math.exp(-ak1)
    if (x >= 1) cp += x * xi
    out.push(cp)
    xPrev = x
    xiPrev = xi
  }
  return out
}

/** Utah model chill units for one hour (Richardson et al. 1974). */
export function utahChillUnit(tempC: number): number {
  if (tempC <= 1.4) return 0
  if (tempC <= 2.4) return 0.5
  if (tempC <= 9.1) return 1
  if (tempC <= 12.4) return 0.5
  if (tempC <= 15.9) return 0
  if (tempC <= 18.0) return -0.5
  return -1
}

/** Cumulative Utah chill units at each hour. */
export function chillUnitsUtah(hourlyTempsC: number[]): number[] {
  let total = 0
  return hourlyTempsC.map(t => (total += utahChillUnit(t)))
}

/** The chill-hours model counts hours below this temperature (°C). */
export const CHILL_HOURS_BELOW_C = 7.2

/** Cumulative chill hours (hours below 7.2 °C) at each hour. */
export function chillHours(hourlyTempsC: number[]): number[] {
  let total = 0
  return hourlyTempsC.map(t => (total += t < CHILL_HOURS_BELOW_C ? 1 : 0))
}

/** Cardinal temperatures of a growing-degree-hour model; supplied by the pack. */
export interface GdhParams {
  baseC: number
  optimumC: number
  criticalC: number
}

/** Growing degree hours for one hour (Anderson et al. 1986, as in chillR::GDH). */
export function growingDegreeHour(tempC: number, p: GdhParams): number {
  const { baseC, optimumC, criticalC } = p
  if (!(baseC < optimumC && optimumC < criticalC)) throw new Error('GDH needs base < optimum < critical')
  if (tempC <= baseC || tempC >= criticalC) return 0
  const span = optimumC - baseC
  if (tempC <= optimumC) {
    return (span / 2) * (1 + Math.cos(Math.PI + (Math.PI * (tempC - baseC)) / span))
  }
  return span * (1 + Math.cos(Math.PI / 2 + ((Math.PI / 2) * (tempC - optimumC)) / (criticalC - optimumC)))
}

/** Cumulative growing degree hours at each hour. */
export function growingDegreeHours(hourlyTempsC: number[], p: GdhParams): number[] {
  let total = 0
  return hourlyTempsC.map(t => (total += growingDegreeHour(t, p)))
}

export interface ReconstructedHourly {
  temps: number[]
  /** Always true: the series is an idealised curve, not measured hours. */
  reconstructed: true
}

/** Hour of the day (0-23) at which the idealised curve peaks. */
const IDEALISED_PEAK_HOUR = 15

/**
 * Hourly temperatures rebuilt from daily minimum and maximum with an
 * idealised daily curve (a sinusoid peaking mid-afternoon). Used only when
 * hourly data is missing; the result is flagged so that anything computed
 * from it carries reduced confidence.
 */
export function hourlyFromDaily(days: { tminC: number; tmaxC: number }[]): ReconstructedHourly {
  const temps: number[] = []
  for (const d of days) {
    if (d.tmaxC < d.tminC) throw new Error('tmax < tmin')
    const mean = (d.tmaxC + d.tminC) / 2
    const amplitude = (d.tmaxC - d.tminC) / 2
    for (let h = 0; h < 24; h++) {
      temps.push(mean + amplitude * Math.cos((2 * Math.PI * (h - IDEALISED_PEAK_HOUR)) / 24))
    }
  }
  return { temps, reconstructed: true }
}
