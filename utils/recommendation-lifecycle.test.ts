import { describe, expect, it } from 'vitest'
import {
  describeBlockHistory,
  describeOutcome,
  isExpired,
  notExpiredFilter,
  type PastRecommendation,
} from './recommendation-lifecycle'

const now = new Date('2026-09-30T12:00:00Z')

const rec = (over: Partial<PastRecommendation> = {}): PastRecommendation => ({
  id: 'r1',
  block_id: 'b1',
  category: 'irrigate',
  title: 'Irrigate 25 mm',
  status: 'pending',
  created_at: '2026-09-22T04:00:00Z',
  acted_at: null,
  expires_at: '2026-10-06T04:00:00Z',
  manager_note: null,
  activity_log_id: null,
  ...over,
})

describe('isExpired', () => {
  it('treats a missing expiry as open', () => {
    expect(isExpired(null, now)).toBe(false)
  })
  it('is expired at or after the expiry time', () => {
    expect(isExpired('2026-09-30T12:00:00Z', now)).toBe(true)
    expect(isExpired('2026-09-29T00:00:00Z', now)).toBe(true)
    expect(isExpired('2026-10-01T00:00:00Z', now)).toBe(false)
  })
})

describe('notExpiredFilter', () => {
  it('quotes the timestamp for PostgREST', () => {
    expect(notExpiredFilter(now)).toBe('expires_at.is.null,expires_at.gt."2026-09-30T12:00:00.000Z"')
  })
})

describe('describeOutcome', () => {
  it('names the skip reason', () => {
    const r = rec({ status: 'skipped', acted_at: '2026-09-23T08:00:00Z', manager_note: 'skip_reason:disagree' })
    expect(describeOutcome(r, undefined, now)).toBe('SKIPPED on 2026-09-23: manager disagreed')
  })
  it('says when no reason was given', () => {
    const r = rec({ status: 'skipped', acted_at: '2026-09-23T08:00:00Z' })
    expect(describeOutcome(r, undefined, now)).toBe('SKIPPED on 2026-09-23 (no reason given)')
  })
  it('reads a completed event as done', () => {
    const r = rec({ status: 'accepted' })
    expect(describeOutcome(r, { start_date: '2026-09-24T06:00:00Z', completed_at: '2026-09-24T10:00:00Z' }, now)).toBe('DONE on 2026-09-24')
  })
  it('reads a linked activity log as done even without the event', () => {
    expect(describeOutcome(rec({ status: 'edited', activity_log_id: 'a1' }), undefined, now)).toBe('DONE (edited by the manager)')
  })
  it('reads a booked, unfinished event as scheduled', () => {
    const r = rec({ status: 'accepted' })
    expect(describeOutcome(r, { start_date: '2026-10-02T06:00:00Z', completed_at: null }, now)).toBe('SCHEDULED for 2026-10-02, not yet logged as done')
  })
  it('separates open and expired pending cards', () => {
    expect(describeOutcome(rec(), undefined, now)).toMatch(/^NOT ACTED ON/)
    expect(describeOutcome(rec({ expires_at: '2026-09-25T00:00:00Z' }), undefined, now)).toBe('EXPIRED without action')
  })
})

describe('describeBlockHistory', () => {
  it('says none when there is no history', () => {
    const lines = describeBlockHistory([], new Map(), [], now)
    expect(lines).toContain('Previous recommendations: none')
    expect(lines).toContain('Work logged on this block: none')
  })

  it('lists newest first with outcomes, notes and logged work', () => {
    const lines = describeBlockHistory(
      [
        rec({ id: 'old', created_at: '2026-09-10T04:00:00Z', title: 'Scout for mites', category: 'scout', status: 'skipped', acted_at: '2026-09-11T00:00:00Z', manager_note: 'skip_reason:already_done' }),
        rec({ id: 'new', status: 'edited', manager_note: 'Only the east half' }),
      ],
      new Map([['new', { start_date: '2026-10-01T06:00:00Z', completed_at: null }]]),
      [{ activity_type: 'irrigation', title: 'Drip run', performed_at: '2026-09-20T18:00:00Z' }],
      now,
    )
    expect(lines.slice(1)).toEqual([
      'Previous recommendations:',
      '  - 2026-09-22 [irrigate] "Irrigate 25 mm" -> SCHEDULED for 2026-10-01, not yet logged as done (edited by the manager) | manager note: "Only the east half"',
      '  - 2026-09-10 [scout] "Scout for mites" -> SKIPPED on 2026-09-11: manager says it was already done',
      'Work logged on this block:',
      '  - 2026-09-20 irrigation: "Drip run"',
    ])
  })

  it('keeps titles on one line so the block separator cannot appear', () => {
    const lines = describeBlockHistory([rec({ title: 'Irrigate\n\n---\n\nnow' })], new Map(), [], now)
    expect(lines.join('\n')).not.toContain('\n\n---\n\n')
  })
})
