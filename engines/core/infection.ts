/**
 * Infection values from leaf wetness and temperature (CDSS spec §A4.6).
 *
 * A generic evaluator for wetness x temperature disease models (TOMCAST-style
 * severity tables, Mills-type tables and similar). The bands, the event
 * separation rule, the aggregation and the accumulation window all come from
 * the pack's disease model.
 */

export interface InfectionBand {
  /** Mean wet-period temperature band, lower bound included, upper excluded. */
  tmin: number
  tmax: number
  /** [minimum wet hours, value] pairs in ascending order of hours. */
  steps: [number, number][]
}

export interface InfectionModel {
  bands: InfectionBand[]
  /** Consecutive dry hours that end a wet event. */
  dryHoursSplit: number
  aggregate: 'max' | 'sum'
}

export interface HourlyWetness {
  /** Air temperature in the model's units. */
  temp: number
  wet: boolean
}

/** The infection value for one evaluation window (usually one day). */
export function infectionValueForDay(hourly: HourlyWetness[], model: InfectionModel): number {
  const events: number[][] = []
  let current: number[] = []
  let dry = 0
  for (const h of hourly) {
    if (h.wet) {
      if (dry >= model.dryHoursSplit && current.length > 0) {
        events.push(current)
        current = []
      }
      current.push(h.temp)
      dry = 0
    } else {
      dry += 1
    }
  }
  if (current.length > 0) events.push(current)

  const values = events.map(event => {
    const hours = event.length
    const meanTemp = event.reduce((a, b) => a + b, 0) / hours
    let value = 0
    for (const band of model.bands) {
      if (band.tmin <= meanTemp && meanTemp < band.tmax) {
        for (const [minHours, v] of band.steps) {
          if (hours >= minHours) value = v
        }
      }
    }
    return value
  })
  if (values.length === 0) return 0
  return model.aggregate === 'max' ? Math.max(...values) : values.reduce((a, b) => a + b, 0)
}

export interface DailyInfectionValue {
  /** ISO date, yyyy-mm-dd. */
  date: string
  value: number
}

/**
 * Accumulated infection value on `asOf`: the sum over the rolling window,
 * counting only days after the most recent reset (a spray against the
 * disease, when the model resets on spray).
 */
export function accumulatedInfection(
  daily: DailyInfectionValue[],
  asOf: string,
  windowDays: number,
  resetDates: string[] = [],
): number {
  const end = Date.parse(`${asOf}T00:00:00Z`)
  const start = end - (windowDays - 1) * 86_400_000
  const lastReset = resetDates
    .map(d => Date.parse(`${d}T00:00:00Z`))
    .filter(t => t <= end)
    .reduce((latest, t) => Math.max(latest, t), -Infinity)
  return daily.reduce((sum, d) => {
    const t = Date.parse(`${d.date}T00:00:00Z`)
    return t >= start && t <= end && t > lastReset ? sum + d.value : sum
  }, 0)
}
