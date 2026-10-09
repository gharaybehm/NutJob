/**
 * Reference evapotranspiration, FAO-56 Penman-Monteith, daily step
 * (CDSS spec §A4.1; Allen et al. 1998, FAO Irrigation & Drainage Paper 56).
 *
 * Crop-independent. Checked against FAO-56 Example 18 and against values
 * produced once with pyet 1.5 (`__fixtures__/et0-pyet.json`).
 */

export interface Et0Input {
  /** Daily maximum and minimum air temperature, °C. */
  tmax: number
  tmin: number
  /** Daily mean air temperature, °C. Defaults to (tmax + tmin) / 2. */
  tmean?: number
  /** Daily maximum and minimum relative humidity, %. */
  rhmax: number
  rhmin: number
  /** Wind speed at 2 m, m/s. Convert other heights with `windAt2m` first. */
  wind2m: number
  /** Incoming solar radiation, MJ m-2 day-1. */
  rs?: number
  /** Actual sunshine duration, hours. Used when `rs` is not given (FAO-56 Eq. 35). */
  sunshineHours?: number
  elevationM: number
  latitudeDeg: number
  dayOfYear: number
}

const SOLAR_CONSTANT = 0.082 // MJ m-2 min-1
const STEFAN_BOLTZMANN = 4.903e-9 // MJ K-4 m-2 day-1
const ALBEDO = 0.23 // hypothetical grass reference crop

/** Saturation vapour pressure at temperature t (kPa), FAO-56 Eq. 11. */
export function saturationVapourPressure(t: number): number {
  return 0.6108 * Math.exp((17.27 * t) / (t + 237.3))
}

/** Extraterrestrial radiation (MJ m-2 day-1) and daylight hours, FAO-56 Eqs. 21-25 and 34. */
export function extraterrestrialRadiation(latitudeDeg: number, dayOfYear: number): { ra: number; daylightHours: number } {
  const phi = (latitudeDeg * Math.PI) / 180
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365)
  const decl = 0.409 * Math.sin((2 * Math.PI * dayOfYear) / 365 - 1.39)
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(decl))))
  const ra =
    ((24 * 60) / Math.PI) *
    SOLAR_CONSTANT *
    dr *
    (ws * Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.sin(ws))
  return { ra, daylightHours: (24 / Math.PI) * ws }
}

/** FAO-56 Penman-Monteith reference ET for one day (mm/day), FAO-56 Eq. 6. */
export function et0PenmanMonteith(input: Et0Input): number {
  const { tmax, tmin, rhmax, rhmin, wind2m, elevationM } = input
  if (tmax < tmin) throw new Error('tmax < tmin')
  const tmean = input.tmean ?? (tmax + tmin) / 2

  const pressure = 101.3 * Math.pow((293 - 0.0065 * elevationM) / 293, 5.26)
  const gamma = 0.000665 * pressure
  const delta = (4098 * saturationVapourPressure(tmean)) / Math.pow(tmean + 237.3, 2)

  const esMax = saturationVapourPressure(tmax)
  const esMin = saturationVapourPressure(tmin)
  const es = (esMax + esMin) / 2
  const ea = (esMin * (rhmax / 100) + esMax * (rhmin / 100)) / 2

  const { ra, daylightHours } = extraterrestrialRadiation(input.latitudeDeg, input.dayOfYear)
  let rs = input.rs
  if (rs === undefined) {
    if (input.sunshineHours === undefined) throw new Error('either rs or sunshineHours is required')
    rs = (0.25 + (0.5 * input.sunshineHours) / daylightHours) * ra
  }
  const rso = (0.75 + 2e-5 * elevationM) * ra
  const rns = (1 - ALBEDO) * rs
  const cloudiness = Math.min(1, rso > 0 ? rs / rso : 1)
  const rnl =
    STEFAN_BOLTZMANN *
    ((Math.pow(tmax + 273.16, 4) + Math.pow(tmin + 273.16, 4)) / 2) *
    (0.34 - 0.14 * Math.sqrt(ea)) *
    (1.35 * cloudiness - 0.35)
  const rn = rns - rnl

  // Soil heat flux is taken as zero at the daily step (FAO-56 Eq. 42).
  const et0 =
    (0.408 * delta * rn + ((gamma * 900) / (tmean + 273)) * wind2m * (es - ea)) /
    (delta + gamma * (1 + 0.34 * wind2m))
  return Math.max(0, et0)
}
