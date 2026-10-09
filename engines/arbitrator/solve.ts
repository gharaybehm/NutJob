/**
 * The arbitrator's solver (CDSS spec §A8): chooses which proposed actions
 * run, and on which day, within the farm's daily limits.
 *
 * The specification's reference uses OR-Tools CP-SAT. This is an exact
 * branch-and-bound search in its place: the problem is small (tens of
 * actions over seven days), needs no dependency, and runs inside the
 * application. It stops at a node limit and then returns the best plan
 * found, marked FEASIBLE instead of OPTIMAL.
 *
 * What it maximises, in this order:
 *   1. mandatory actions scheduled (a safeguard or legal requirement)
 *   2. money: sum of value - delay cost x day, as in the specification
 *   3. priority of the actions scheduled (daily engines before seasonal tasks)
 *   4. earliness
 * Tiers 3 and 4 only decide between plans the money tier does not separate,
 * which is every plan while actions carry no money value.
 */

export interface ArbAction {
  id: string
  /** Days from today the action may run on, after windows and safeguard vetoes. */
  days: number[]
  /** Expected loss avoided x confidence, in money. */
  value: number
  delayCostPerDay: number
  labourHrs: number
  waterM3: number
  /** Equipment it occupies for the day, one unit of each. */
  equipment: string[]
  mandatory: boolean
  /** Higher runs first when money does not decide. */
  priority: number
}

export interface ArbLimits {
  horizonDays: number
  /** Per day; null means the farm has set no limit. */
  labourHrsPerDay: number | null
  waterM3PerDay: number | null
  /** Units available per day, by equipment name; an unlisted name is not limited. */
  equipmentPerDay: Record<string, number>
  /** Water left in the seasonal allocation; null when not tracked. */
  waterQuotaM3: number | null
}

export interface ArbResult {
  status: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE'
  plan: { actionId: string; day: number }[]
  unscheduled: string[]
  objective: { mandatory: number; money: number; priority: number; daySum: number }
  nodes: number
}

interface Score {
  mandatory: number
  money: number
  priority: number
  daySum: number
}

const EPS = 1e-9
const NODE_LIMIT = 200_000

/** True when a is strictly better than b. */
function better(a: Score, b: Score): boolean {
  if (a.mandatory !== b.mandatory) return a.mandatory > b.mandatory
  if (Math.abs(a.money - b.money) > EPS) return a.money > b.money
  if (a.priority !== b.priority) return a.priority > b.priority
  return a.daySum < b.daySum
}

export class Usage {
  labour: number[]
  water: number[]
  equipment: Record<string, number>[]
  waterTotal = 0

  constructor(private limits: ArbLimits) {
    this.labour = Array.from({ length: limits.horizonDays }, () => 0)
    this.water = Array.from({ length: limits.horizonDays }, () => 0)
    this.equipment = Array.from({ length: limits.horizonDays }, () => ({}))
  }

  /** The resources that would be exceeded by running the action on the day; empty when it fits. */
  shortfalls(a: ArbAction, day: number): string[] {
    const l = this.limits
    const short: string[] = []
    if (l.labourHrsPerDay !== null && this.labour[day] + a.labourHrs > l.labourHrsPerDay + EPS) short.push('labour')
    if (l.waterM3PerDay !== null && this.water[day] + a.waterM3 > l.waterM3PerDay + EPS) short.push('water')
    if (l.waterQuotaM3 !== null && this.waterTotal + a.waterM3 > l.waterQuotaM3 + EPS) short.push('water allocation')
    for (const e of a.equipment) {
      const cap = l.equipmentPerDay[e]
      if (cap !== undefined && (this.equipment[day][e] ?? 0) + 1 > cap) short.push(e)
    }
    return short
  }

  add(a: ArbAction, day: number, sign: 1 | -1 = 1): void {
    this.labour[day] += sign * a.labourHrs
    this.water[day] += sign * a.waterM3
    this.waterTotal += sign * a.waterM3
    for (const e of a.equipment) this.equipment[day][e] = (this.equipment[day][e] ?? 0) + sign
  }
}

const contribution = (a: ArbAction, day: number) => a.value - a.delayCostPerDay * day

export function solve(actions: ArbAction[], limits: ArbLimits): ArbResult {
  const order = [...actions].sort((a, b) => {
    if (a.mandatory !== b.mandatory) return a.mandatory ? -1 : 1
    const va = Math.max(0, ...a.days.map(d => contribution(a, d)))
    const vb = Math.max(0, ...b.days.map(d => contribution(b, d)))
    if (Math.abs(va - vb) > EPS) return vb - va
    if (a.priority !== b.priority) return b.priority - a.priority
    return a.days.length - b.days.length
  })

  // The most each remaining action could still add, from position i on.
  const suffix: Score[] = Array.from({ length: order.length + 1 }, () => ({ mandatory: 0, money: 0, priority: 0, daySum: 0 }))
  for (let i = order.length - 1; i >= 0; i--) {
    const a = order[i]
    const best = a.days.length > 0 ? Math.max(...a.days.map(d => contribution(a, d))) : -Infinity
    const placeable = a.days.length > 0 && (a.mandatory || best >= -EPS)
    suffix[i] = {
      mandatory: suffix[i + 1].mandatory + (a.mandatory && a.days.length > 0 ? 1 : 0),
      money: suffix[i + 1].money + (placeable ? (a.mandatory ? best : Math.max(0, best)) : 0),
      priority: suffix[i + 1].priority + (placeable ? a.priority : 0),
      daySum: suffix[i + 1].daySum + (placeable ? Math.min(...a.days) : 0),
    }
  }

  const usage = new Usage(limits)
  const chosen: (number | null)[] = Array.from({ length: order.length }, () => null)
  let best: { score: Score; days: (number | null)[] } = { score: { mandatory: -1, money: -Infinity, priority: -1, daySum: Infinity }, days: [...chosen] }
  let nodes = 0
  let exhausted = true

  const search = (i: number, score: Score): void => {
    if (nodes >= NODE_LIMIT) {
      exhausted = false
      return
    }
    nodes++
    if (i === order.length) {
      if (better(score, best.score)) best = { score: { ...score }, days: [...chosen] }
      return
    }
    const s = suffix[i]
    const bound: Score = { mandatory: score.mandatory + s.mandatory, money: score.money + s.money, priority: score.priority + s.priority, daySum: score.daySum + s.daySum }
    if (!better(bound, best.score)) return

    const a = order[i]
    const days = [...a.days].sort((x, y) => contribution(a, y) - contribution(a, x) || x - y)
    for (const day of days) {
      const gain = contribution(a, day)
      // An optional action that costs more in delay than it is worth is left out.
      if (!a.mandatory && gain < -EPS) continue
      if (usage.shortfalls(a, day).length > 0) continue
      usage.add(a, day)
      chosen[i] = day
      search(i + 1, { mandatory: score.mandatory + (a.mandatory ? 1 : 0), money: score.money + gain, priority: score.priority + a.priority, daySum: score.daySum + day })
      usage.add(a, day, -1)
      chosen[i] = null
    }
    search(i + 1, score)
  }
  search(0, { mandatory: 0, money: 0, priority: 0, daySum: 0 })

  const plan = order
    .flatMap((a, i) => (best.days[i] === null ? [] : [{ actionId: a.id, day: best.days[i] as number }]))
    .sort((x, y) => x.day - y.day || x.actionId.localeCompare(y.actionId))
  const scheduled = new Set(plan.map(p => p.actionId))
  const mandatoryTotal = actions.filter(a => a.mandatory).length
  return {
    status: best.score.mandatory < mandatoryTotal ? 'INFEASIBLE' : exhausted ? 'OPTIMAL' : 'FEASIBLE',
    plan,
    unscheduled: actions.filter(a => !scheduled.has(a.id)).map(a => a.id),
    objective: best.score,
    nodes,
  }
}
