import { describe, expect, it } from 'vitest'
import { assessFarmHealth, describeAge, summarizeRecommendations, type FarmSignals, type RecommendationFacts } from './farm-health'

const NOW = new Date('2026-10-05T12:00:00Z')
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()

const healthy = (over: Partial<FarmSignals> = {}): FarmSignals => ({
  hasLocation: true,
  blocks: 6,
  blocksMissingSoil: 0,
  blocksMissingVariety: 0,
  blocksMissingPlantingDate: 0,
  lastRun: { weather: ago(2), computeFields: ago(12), dailySnapshot: ago(3), recommendations: ago(30) },
  sensors: { total: 2, reporting: 2, silent: 0 },
  openAlerts: { critical: 0, warning: 1, info: 0 },
  pendingRecommendations: 4,
  lastActivity: ago(40),
  knowledgeGaps: 0,
  ...over,
})

describe('describeAge', () => {
  it('reads as hours, then days, or never', () => {
    expect(describeAge(ago(0.5), NOW)).toBe('under 1 h ago')
    expect(describeAge(ago(5.9), NOW)).toBe('5 h ago')
    expect(describeAge(ago(72), NOW)).toBe('3 d ago')
    expect(describeAge(null, NOW)).toBe('never')
  })
})

describe('assessFarmHealth', () => {
  it('is healthy when the jobs are fresh and nothing needs attention', () => {
    const h = assessFarmHealth(healthy(), NOW)
    expect(h.level).toBe('healthy')
    expect(h.issues).toEqual([])
    expect(h.jobs.every(j => !j.stale)).toBe(true)
  })

  it('is stalled when a scheduled job has stopped producing data', () => {
    const h = assessFarmHealth(healthy({ lastRun: { weather: ago(9), computeFields: ago(12), dailySnapshot: ago(3), recommendations: ago(30) } }), NOW)
    expect(h.level).toBe('stalled')
    expect(h.issues).toEqual([{ level: 'stalled', message: 'Weather update last produced data 9 h ago.' }])
  })

  it('is stalled when a job has never produced data', () => {
    const h = assessFarmHealth(healthy({ lastRun: { weather: ago(2), computeFields: ago(12), dailySnapshot: null, recommendations: ago(30) } }), NOW)
    expect(h.level).toBe('stalled')
    expect(h.issues[0].message).toBe('Daily snapshot has never produced data.')
  })

  it('treats a silent weekly AI run as attention, not a stall', () => {
    const h = assessFarmHealth(healthy({ lastRun: { weather: ago(2), computeFields: ago(12), dailySnapshot: ago(3), recommendations: ago(9 * 24) } }), NOW)
    expect(h.level).toBe('attention')
    expect(h.issues[0]).toEqual({ level: 'attention', message: 'AI recommendations last produced data 9 d ago.' })
  })

  it('does not call the location-bound jobs stalled when the farm has no location', () => {
    const h = assessFarmHealth(healthy({ hasLocation: false, lastRun: { weather: null, computeFields: null, dailySnapshot: ago(3), recommendations: ago(30) } }), NOW)
    expect(h.level).toBe('attention')
    expect(h.issues.map(i => i.message)).toEqual(['No GPS location is set, so weather and the daily calculations do not run.'])
  })

  it('is not set up, and nothing else, when the farm has no blocks', () => {
    const h = assessFarmHealth(healthy({ blocks: 0, lastRun: { weather: null, computeFields: null, dailySnapshot: null, recommendations: null }, lastActivity: null }), NOW)
    expect(h.level).toBe('not_set_up')
    expect(h.issues).toHaveLength(1)
  })

  it('raises attention for setup gaps, silent sensors, critical alerts and knowledge gaps', () => {
    const h = assessFarmHealth(healthy({
      blocksMissingSoil: 6, blocksMissingVariety: 1, knowledgeGaps: 2,
      sensors: { total: 3, reporting: 2, silent: 1 }, openAlerts: { critical: 2, warning: 0, info: 0 },
    }), NOW)
    expect(h.level).toBe('attention')
    expect(h.issues.map(i => i.message)).toEqual([
      '2 critical alerts unresolved.',
      '1 sensor of 3 not reporting.',
      '6 blocks of 6 missing field capacity, wilting point or root depth: irrigation advice is off for them.',
      '1 block with no variety set.',
      '2 crops or varieties with no guides loaded.',
    ])
  })

  it('does not raise warnings or pending cards on their own', () => {
    expect(assessFarmHealth(healthy({ openAlerts: { critical: 0, warning: 5, info: 3 }, pendingRecommendations: 20 }), NOW).level).toBe('healthy')
  })

  it('notices a farm nobody is using', () => {
    expect(assessFarmHealth(healthy({ lastActivity: ago(20 * 24) }), NOW).issues[0].message).toBe('No work logged or recommendation acted on since 20 d ago.')
    expect(assessFarmHealth(healthy({ lastActivity: null }), NOW).issues[0].message).toBe('Nobody has logged work or acted on a recommendation yet.')
    expect(assessFarmHealth(healthy({ lastActivity: ago(13 * 24) }), NOW).level).toBe('healthy')
  })
})

describe('summarizeRecommendations', () => {
  const rec = (over: Partial<RecommendationFacts>): RecommendationFacts =>
    ({ status: 'pending', expired: false, skipReason: null, sourceBacked: true, referenceStatus: 'found', ...over })

  it('counts each outcome once', () => {
    const s = summarizeRecommendations([
      rec({ status: 'accepted' }), rec({ status: 'edited' }),
      rec({ status: 'skipped', skipReason: 'disagree' }), rec({ status: 'skipped', skipReason: 'disagree' }), rec({ status: 'skipped' }),
      rec({ expired: true }), rec({}),
    ])
    expect(s).toMatchObject({ total: 7, accepted: 2, skipped: 3, expired: 1, open: 1 })
    expect(s.skipReasons).toEqual({ disagree: 2, no_reason: 1 })
  })

  it('counts cards with no source, and why when it is known', () => {
    const s = summarizeRecommendations([
      rec({ sourceBacked: false, referenceStatus: 'none_loaded' }),
      rec({ sourceBacked: false, referenceStatus: 'error' }),
      rec({ sourceBacked: false, referenceStatus: 'no_match' }),
      rec({ sourceBacked: false, referenceStatus: null }),
      rec({}),
    ])
    expect(s).toMatchObject({ notSourceBacked: 4, noGuidesLoaded: 1, lookupFailed: 1 })
  })

  it('is all zeros for no recommendations', () => {
    expect(summarizeRecommendations([])).toMatchObject({ total: 0, accepted: 0, skipped: 0, expired: 0, open: 0, notSourceBacked: 0 })
  })
})
