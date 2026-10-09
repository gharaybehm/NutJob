/**
 * Frost protection engine (CDSS spec §A6.5): warns of frost risk for the
 * next nights and proposes protection in time to act. The critical
 * temperatures, the damage levels and the phases in which the engine is
 * active come from the pack; the margins are farm settings.
 *
 *   watch    -> check equipment and fuel, confirm crew availability
 *   warning  -> schedule protection
 *   critical -> mandatory protection, then damage scouting
 */

import { frostRiskForNight, type CriticalTemperature, type FrostNightRisk } from '../core/frost'
import type { PackContext } from '../pack/context'
import type { BlockState, DecisionEngine, EngineDiagnosis, ProposedAction } from '../framework/types'
import { proposeAction, stateFlags } from './action'

export interface FrostNight {
  date: string
  /** Days from today. */
  dayIndex: number
  minC: number
}

interface Assessment {
  inactiveReason: string | null
  stageId: string | null
  evidence: string | null
  nights: { night: FrostNight; risk: FrostNightRisk }[]
}

function assess(state: BlockState, pack: PackContext): Assessment {
  const none = { stageId: null, evidence: null, nights: [] }
  const frost = pack.pack.frost
  if (!frost) return { ...none, inactiveReason: 'The pack has no frost section' }
  const phase = typeof state.phase === 'string' ? state.phase : null
  if (phase === null) return { ...none, inactiveReason: 'The growth phase is not known' }
  if (!frost.active_phases.includes(phase)) return { ...none, inactiveReason: `Frost is not assessed in the ${phase} phase` }
  const stage = frost.stages.find(s => s.phase === phase)
  if (!stage) return { ...none, inactiveReason: `The pack has no critical temperature for the ${phase} phase` }

  const variety = typeof state.variety === 'string' ? state.variety : null
  const levels = (variety !== null && stage.by_variety[variety]) || stage.critical
  const critical: CriticalTemperature[] = []
  for (const level of levels) {
    const tempC = pack.params[level.temp_c.slice(1)]
    if (typeof tempC !== 'number') {
      return { ...none, stageId: stage.id, inactiveReason: `${level.temp_c} is still to be sourced` }
    }
    critical.push({ tempC, damageFraction: level.damage_fraction })
  }

  const warningMarginC = Number(state.frost_warning_margin_c)
  const watchMarginC = Number(state.frost_watch_margin_c)
  if (!Number.isFinite(warningMarginC) || !Number.isFinite(watchMarginC)) {
    return { ...none, stageId: stage.id, inactiveReason: 'The farm has no frost margins set' }
  }

  const forecast = Array.isArray(state.frost_nights) ? (state.frost_nights as FrostNight[]) : []
  const nights = forecast.flatMap(night => {
    const risk = frostRiskForNight({ forecastMinC: night.minC, uncertaintyC: 0, critical, warningMarginC, watchMarginC })
    return risk ? [{ night, risk }] : []
  })
  // Cite the source of the values actually used: a variety's levels can come from a different study than the stage's.
  const usedId = levels[0].temp_c.slice(1)
  const evidence = pack.pack.parameters.parameters.find(p => p.id === usedId)?.evidence ?? stage.evidence
  return { inactiveReason: null, stageId: stage.id, evidence, nights }
}

const RULE = { watch: 'FROST-WATCH', warning: 'FROST-WARNING', critical: 'FROST-CRITICAL' } as const

export const frostEngine: DecisionEngine = {
  engineId: 'frost',
  engineClass: 'continuous',
  packRequirements: () => ['frost.stages'],
  requiredState: () => ['phase', 'variety', 'frost_nights', 'frost_warning_margin_c', 'frost_watch_margin_c'],
  safeguards: () => ['SG-FRO-1', 'SG-FRO-2'],

  diagnose(state, pack): EngineDiagnosis {
    const a = assess(state, pack)
    if (a.inactiveReason) return { ruleId: null, outcome: null, skipped: [], notes: [a.inactiveReason] }
    const worst = a.nights.reduce<(typeof a.nights)[number] | null>(
      (w, n) => (w === null || n.risk.marginC < w.risk.marginC ? n : w),
      null,
    )
    if (!worst || worst.risk.level === 'none') {
      return { ruleId: null, outcome: 'none', skipped: [], notes: [worst ? `Coldest forecast night ${worst.night.date}: ${worst.night.minC} degC` : 'No forecast nights'] }
    }
    return { ruleId: RULE[worst.risk.level], outcome: worst.risk.level, skipped: [], notes: [`Coldest forecast night ${worst.night.date}: ${worst.night.minC} degC`] }
  },

  evaluate(blockId, state, pack): ProposedAction[] {
    const a = assess(state, pack)
    if (a.inactiveReason) return []
    const flags = stateFlags(state)
    const actions: ProposedAction[] = []

    for (const { night, risk } of a.nights) {
      if (risk.level === 'none') continue
      const common = {
        engineId: 'frost' as const,
        packId: pack.packId,
        packVersion: pack.packVersion,
        blockId,
        evidence: a.evidence,
        flags,
        inputsSnapshot: {
          phase: state.phase,
          variety: state.variety ?? null,
          frost_stage: a.stageId,
          night: night.date,
          forecast_min_c: night.minC,
          critical_c: risk.criticalC,
          margin_c: Math.round(risk.marginC * 100) / 100,
          damage_fraction: risk.damageFraction,
          damage_note: risk.damageNote,
          // Loss with no protection, when the crop value and a damage fraction are both known.
          projected_loss:
            typeof state.crop_value === 'number' && risk.damageFraction !== null ? Math.round(state.crop_value * risk.damageFraction) : null,
          warning_margin_c: state.frost_warning_margin_c,
          watch_margin_c: state.frost_watch_margin_c,
        },
      }
      const when = `Forecast minimum ${night.minC} degC on ${night.date}; critical temperature ${risk.criticalC} degC`

      if (risk.level === 'watch') {
        actions.push(
          proposeAction({
            ...common,
            ruleId: RULE.watch,
            actionType: 'frost_prepare',
            description: `Check frost protection equipment and fuel, and confirm crew availability. ${when}`,
            earliestDay: 0,
            latestDay: Math.max(0, night.dayIndex - 1),
          }),
        )
        continue
      }

      actions.push(
        proposeAction({
          ...common,
          ruleId: RULE[risk.level],
          actionType: 'frost_protect',
          description: `${risk.level === 'critical' ? 'Run' : 'Schedule'} frost protection for the night. ${when}`,
          earliestDay: night.dayIndex,
          latestDay: night.dayIndex,
          mandatory: risk.level === 'critical',
          expectedOutcome: 'Air temperature in the block held above the critical temperature through the night',
        }),
      )
      if (risk.level === 'critical') {
        actions.push(
          proposeAction({
            ...common,
            ruleId: RULE.critical,
            actionType: 'frost_damage_scouting',
            description: `Scout for frost damage after the night of ${night.date}`,
            earliestDay: night.dayIndex + 1,
            latestDay: night.dayIndex + 3,
          }),
        )
      }
    }
    return actions
  },
}
