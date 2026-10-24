import { describe, expect, it } from 'vitest'
import type { ProposedAction } from '@/engines/framework/types'
import { buildEngineLayer, itemsOnDate, nightLevels } from './calendar-layer'
import type { StoredPlanEntry } from './plan-view'

const TODAY = '2026-03-20'

const action = (over: Partial<ProposedAction>): ProposedAction =>
  ({
    actionId: 'a',
    engineId: 'irrigation',
    ruleId: 'R',
    packId: 'p',
    packVersion: '1',
    blockId: 'b1',
    actionType: 'irrigate',
    description: 'Irrigate 20 mm',
    inputsSnapshot: {},
    flags: [],
    ...over,
  }) as ProposedAction

const entry = (a: ProposedAction, date: string, mode: 'shadow' | 'live' = 'shadow'): StoredPlanEntry => ({ actionId: a.actionId, blockId: a.blockId, date, logId: null, mode, action: a })

describe('buildEngineLayer', () => {
  it('places planned actions on their day, with their mode', () => {
    const items = buildEngineLayer({ plan: { planDate: TODAY, planned: [entry(action({}), '2026-03-21', 'live')] }, states: [], frostChecks: [], today: TODAY })
    expect(items).toEqual([expect.objectContaining({ kind: 'planned', start: '2026-03-21', end: '2026-03-21', mode: 'live', title: 'Irrigate 20 mm' })])
  })

  it('spans season task windows and the days a block is closed', () => {
    const state = {
      pollination_plan: { due: [{ templateId: 'T1', task: 'Place hives', earliestDay: 1, latestDay: 4 }], notes: [] },
      reentry_blocked_until: '2026-03-21T18:00:00Z',
      harvest: { phiClearFrom: '2026-03-25' },
      planned_harvest_date: '2026-08-20',
    }
    const items = buildEngineLayer({ plan: null, states: [{ blockId: 'b1', stateDate: TODAY, state }], frostChecks: [], today: TODAY })
    expect(items.map(i => [i.kind, i.start, i.end])).toEqual([
      ['season_task', '2026-03-21', '2026-03-24'],
      ['reentry', TODAY, '2026-03-21'],
      ['preharvest', TODAY, '2026-03-24'],
      ['harvest_planned', '2026-08-20', '2026-08-20'],
    ])
  })

  it('leaves out what has passed', () => {
    const state = { reentry_blocked_until: '2026-03-19T10:00:00Z', harvest: { phiClearFrom: TODAY }, canopy_pruning_plan: { due: [{ templateId: 'T', task: 'x', earliestDay: -5, latestDay: -1 }] } }
    expect(buildEngineLayer({ plan: null, states: [{ blockId: 'b1', stateDate: TODAY, state }], frostChecks: [], today: TODAY })).toEqual([])
  })

  it('takes frost nights from the latest check, and from the plan for a block with none', () => {
    const planFrost = action({ actionId: 'f', blockId: 'b2', engineId: 'frost', ruleId: 'FROST-WARNING', actionType: 'frost_protect', description: 'Schedule frost protection', inputsSnapshot: { night: '2026-03-22' } })
    const items = buildEngineLayer({
      plan: { planDate: TODAY, planned: [entry(planFrost, '2026-03-22')] },
      states: [],
      frostChecks: [{ blockId: 'b1', nights: [{ night: '2026-03-21', level: 'critical', description: 'Run frost protection' }] }],
      today: TODAY,
    })
    expect(items.map(i => [i.kind, i.blockId, i.start, i.level])).toEqual([
      ['frost_night', 'b1', '2026-03-21', 'critical'],
      ['frost_night', 'b2', '2026-03-22', 'warning'],
    ])
  })
})

describe('nightLevels and itemsOnDate', () => {
  it('keeps the worst level of each night and leaves damage scouting out', () => {
    const levels = nightLevels([
      action({ engineId: 'frost', ruleId: 'FROST-WATCH', actionType: 'frost_prepare', inputsSnapshot: { night: 'n1' }, description: 'w' }),
      action({ engineId: 'frost', ruleId: 'FROST-CRITICAL', actionType: 'frost_protect', inputsSnapshot: { night: 'n1' }, description: 'c' }),
      action({ engineId: 'frost', ruleId: 'FROST-CRITICAL', actionType: 'frost_damage_scouting', inputsSnapshot: { night: 'n1' }, description: 's' }),
    ])
    expect(levels).toEqual([{ night: 'n1', level: 'critical', description: 'c' }])
  })

  it('finds the items covering a day', () => {
    const items = buildEngineLayer({ plan: null, states: [{ blockId: 'b1', stateDate: TODAY, state: { reentry_blocked_until: '2026-03-22' } }], frostChecks: [], today: TODAY })
    expect(itemsOnDate(items, '2026-03-21')).toHaveLength(1)
    expect(itemsOnDate(items, '2026-03-23')).toHaveLength(0)
  })
})
