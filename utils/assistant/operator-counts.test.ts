import { describe, expect, it } from 'vitest'
import { countByFarm, countEvents, crossFarmTotals, MIN_FARMS_FOR_TOTALS } from './operator-counts'

const ev = (kind: string, category: string | null = null) => ({ kind, category })

describe('countEvents', () => {
  it('counts each kind and declines by category', () => {
    const c = countEvents([
      ev('question'), ev('question'), ev('unsourced', 'no_match'), ev('decline', 'legal'), ev('decline', 'legal'),
      ev('decline', 'pesticide_no_regulatory'), ev('draft_accepted', 'scout'), ev('draft_dismissed', 'disagree'),
      ev('guides_requested', 'gap'), ev('share_created'), ev('share_viewed'), ev('something_new'),
    ])
    expect(c).toMatchObject({
      questions: 2, unsourced: 1, declines: 3, draftsAccepted: 1, draftsDismissed: 1, guidesRequested: 1, sharesCreated: 1, shareViews: 1,
    })
    expect(c.declinesByCategory).toEqual({ legal: 2, pesticide_no_regulatory: 1 })
  })
})

describe('crossFarmTotals', () => {
  const farms = (n: number) =>
    countByFarm(Array.from({ length: n }, (_, i) => [
      { farm_id: `f${i}`, kind: 'question', category: null },
      { farm_id: `f${i}`, kind: 'decline', category: 'legal' },
    ]).flat())

  it('withholds totals until enough farms contribute', () => {
    expect(crossFarmTotals(farms(MIN_FARMS_FOR_TOTALS - 1))).toEqual({ totals: null, contributingFarms: MIN_FARMS_FOR_TOTALS - 1 })
  })

  it('adds up once enough farms contribute', () => {
    const { totals, contributingFarms } = crossFarmTotals(farms(MIN_FARMS_FOR_TOTALS))
    expect(contributingFarms).toBe(MIN_FARMS_FOR_TOTALS)
    expect(totals).toMatchObject({ questions: MIN_FARMS_FOR_TOTALS, declines: MIN_FARMS_FOR_TOTALS })
    expect(totals?.declinesByCategory).toEqual({ legal: MIN_FARMS_FOR_TOTALS })
  })

  it('does not count a farm that only has other events as contributing', () => {
    const perFarm = farms(MIN_FARMS_FOR_TOTALS - 1)
    perFarm.set('quiet', countEvents([ev('error')]))
    expect(crossFarmTotals(perFarm).totals).toBeNull()
  })
})
