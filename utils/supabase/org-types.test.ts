import { describe, expect, it } from 'vitest'
import { toStoredSubscriptionStatus } from './org-types'

describe('toStoredSubscriptionStatus', () => {
  it('keeps the statuses the column accepts', () => {
    for (const s of ['trialing', 'active', 'past_due', 'canceled', 'incomplete']) {
      expect(toStoredSubscriptionStatus(s)).toBe(s)
    }
  })

  it('maps the others to a status that grants no seats', () => {
    expect(toStoredSubscriptionStatus('unpaid')).toBe('past_due')
    expect(toStoredSubscriptionStatus('paused')).toBe('past_due')
    expect(toStoredSubscriptionStatus('incomplete_expired')).toBe('canceled')
    expect(toStoredSubscriptionStatus('something_new')).toBe('past_due')
  })
})
