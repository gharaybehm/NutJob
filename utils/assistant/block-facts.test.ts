import { describe, expect, it } from 'vitest'
import type { DailySnapshot } from '@/engines/snapshot'
import { blockFacts, formatFacts } from './block-facts'
import { buildSuggestions } from './suggestions'
import { limitHit, DAILY_FARM_CAP, DAILY_USER_CAP } from './limits'

const NOW = new Date('2026-10-07T09:00:00Z')

function snapshot(extra: { hasProfile?: boolean; status?: string; applicable?: boolean; date?: string } = {}): DailySnapshot {
  return {
    version: 3,
    date: extra.date ?? '2026-10-07',
    blockId: 'b1',
    crop: { name: 'Almond', profile: 'almond', hasProfile: extra.hasProfile ?? true },
    variety: 'Vairo',
    varietyRecognised: true,
    rootstock: null,
    maturity: {} as DailySnapshot['maturity'],
    phenology: { stage: { value: 'hull split', unit: '', source: 'computed', observedAt: null, state: 'KNOWN' }, notes: [] },
    water: {
      moisture: { value: 22, unit: '%', source: 'sensor', observedAt: null, state: 'KNOWN' },
      sensor: { health: 'ok' as never, reasons: [], excluded: false },
      etoToday: { value: 4, unit: 'mm', source: 'computed', observedAt: null, state: 'KNOWN' },
      irrigation: {
        status: (extra.status ?? 'irrigate_soon') as never, strategy: 'full', tawMm: 120, rawMm: 48, depletionMm: 40,
        etcMmPerDay: 3.6, daysToThreshold: 2, requirementMm: 18.5, requirementM3: 370, allocationAfterM3: null,
        confidence: 'medium', dataGaps: extra.status === 'data_required' ? ['field capacity is not set'] : [],
      },
    },
    weather: {
      forecastDays: 7,
      forecastAgeHours: 3,
      frost: {
        level: 'watch', applicable: extra.applicable ?? true,
        threshold: (extra.applicable ?? true) ? { lt10: -2.2, lt50: -3.3, lt90: null } as never : null,
        marginC: 2, worstDay: null, days: [], notes: (extra.applicable ?? true) ? [] : ['no frost threshold after harvest'],
      },
    },
  }
}

describe('blockFacts', () => {
  it('quotes the irrigation and frost figures from the snapshot', () => {
    const text = formatFacts(blockFacts(snapshot(), NOW))
    expect(text).toContain('Irrigation requirement: 18.5 mm (daily snapshot of 2026-10-07)')
    expect(text).toContain('10% kill at -2.2 °C, 50% kill at -3.3 °C')
    expect(text).toContain('Growth stage: hull split')
  })

  it('says the irrigation calculation is off, and why, when data is missing', () => {
    const text = formatFacts(blockFacts(snapshot({ status: 'data_required' }), NOW))
    expect(text).toContain('Irrigation calculation: OFF — field capacity is not set')
    expect(text).not.toContain('Irrigation requirement')
  })

  it('turns both calculations off for a crop with no confirmed data', () => {
    const facts = blockFacts(snapshot({ hasProfile: false }), NOW)
    expect(facts.every((f) => 'off' in f)).toBe(true)
  })

  it('says when there is no snapshot, or when it is old', () => {
    expect(formatFacts(blockFacts(null, NOW))).toContain('OFF — no daily snapshot')
    expect(formatFacts(blockFacts(snapshot({ date: '2026-10-01' }), NOW))).toContain('(5 days old)')
  })

  it('reports frost as off outside the stages it applies to', () => {
    expect(formatFacts(blockFacts(snapshot({ applicable: false }), NOW))).toContain('Frost risk calculation: OFF — no frost threshold after harvest')
  })
})

describe('buildSuggestions', () => {
  const alerts = [
    { blockId: 'b1', blockName: 'North', domain: 'water', severity: 'warning' },
    { blockId: 'b2', blockName: 'South', domain: 'frost', severity: 'critical' },
    { blockId: 'b2', blockName: 'South', domain: 'frost', severity: 'warning' },
  ]
  const recs = [{ id: 'r1', blockId: 'b1', blockName: 'North', title: 'Irrigate North block' }]

  it('puts the most severe alerts first, once per block and domain, then open cards', () => {
    const s = buildSuggestions(alerts, recs, null)
    expect(s.map((x) => [x.key, x.values.block])).toEqual([['alert', 'South'], ['alert', 'North'], ['recommendation', 'North']])
    expect(s[2].pins).toEqual({ recommendationId: 'r1', blockId: 'b1' })
  })

  it('keeps to the pinned block and fills with block questions', () => {
    const s = buildSuggestions(alerts, recs, { id: 'b1', name: 'North' })
    expect(s.map((x) => x.key)).toEqual(['alert', 'recommendation', 'lastIrrigation', 'frostWeek'])
  })
})

describe('limitHit', () => {
  it('stops at the user cap first, then the farm cap', () => {
    expect(limitHit(DAILY_USER_CAP - 1, DAILY_FARM_CAP - 1)).toBeNull()
    expect(limitHit(DAILY_USER_CAP, 0)).toBe('limit_user')
    expect(limitHit(0, DAILY_FARM_CAP)).toBe('limit_farm')
  })
})
