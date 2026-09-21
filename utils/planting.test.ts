import { describe, expect, it } from 'vitest'
import { resolvePlanting } from './planting'

const now = new Date('2026-09-21T00:00:00Z')

describe('resolvePlanting', () => {
  it('takes the year from a date', () => {
    expect(resolvePlanting('2025-11-15', '', now)).toEqual({ ok: true, date: '2025-11-15', year: 2025 })
  })

  it('lets the date win over a conflicting year', () => {
    expect(resolvePlanting('2025-11-15', '2019', now)).toEqual({ ok: true, date: '2025-11-15', year: 2025 })
  })

  it('accepts a year alone and keeps the date empty', () => {
    expect(resolvePlanting('', '2025', now)).toEqual({ ok: true, date: null, year: 2025 })
    expect(resolvePlanting(null, 2025, now)).toEqual({ ok: true, date: null, year: 2025 })
  })

  it('refuses to default to the current year when both are empty', () => {
    const r = resolvePlanting('', '', now)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/planting date, or at least the planting year/)
  })

  it.each([
    ['not a date', '2025-13-40', ''],
    ['wrong format', '15/11/2025', ''],
    ['a date that rolls over', '2025-02-30', ''],
    ['too early', '1850-01-01', ''],
    ['too far ahead', '2040-01-01', ''],
    ['a non-numeric year', '', 'last year'],
    ['a fractional year', '', '2025.5'],
    ['a year in the far future', '', '2100'],
  ])('rejects %s', (_label, date, year) => {
    expect(resolvePlanting(date, year, now).ok).toBe(false)
  })

  it('allows planting next year, for a block about to be planted', () => {
    expect(resolvePlanting('', '2027', now).ok).toBe(true)
  })
})
