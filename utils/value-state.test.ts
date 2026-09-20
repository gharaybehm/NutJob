import { describe, expect, it } from 'vitest'
import { classifyValue, makeStatefulValue, usableForCalculation } from './value-state'

const now = new Date('2026-09-20T12:00:00Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()

describe('classifyValue', () => {
  it('is UNKNOWN when there is no value', () => {
    expect(classifyValue({ value: null, source: 'sensor', observedAt: hoursAgo(1), kind: 'soil_moisture', now })).toBe('UNKNOWN')
    expect(classifyValue({ value: NaN, source: 'sensor', observedAt: hoursAgo(1), kind: 'soil_moisture', now })).toBe('UNKNOWN')
  })

  it('is KNOWN for a fresh sensor reading', () => {
    expect(classifyValue({ value: 24, source: 'sensor', observedAt: hoursAgo(2), kind: 'soil_moisture', now })).toBe('KNOWN')
  })

  it('is STALE past the per-kind window', () => {
    expect(classifyValue({ value: 24, source: 'sensor', observedAt: hoursAgo(30), kind: 'soil_moisture', now })).toBe('STALE')
  })

  it('is STALE when the time is missing or unparseable', () => {
    expect(classifyValue({ value: 24, source: 'sensor', observedAt: null, kind: 'soil_moisture', now })).toBe('STALE')
    expect(classifyValue({ value: 24, source: 'sensor', observedAt: 'nope', kind: 'soil_moisture', now })).toBe('STALE')
  })

  it('is ESTIMATED for computed, forecast, default or assumed values', () => {
    expect(classifyValue({ value: 5, source: 'computed', observedAt: hoursAgo(1), kind: 'eto', now })).toBe('ESTIMATED')
    expect(classifyValue({ value: 5, source: 'default', observedAt: hoursAgo(1), kind: 'eto', now })).toBe('ESTIMATED')
    expect(classifyValue({ value: 5, source: 'manual', observedAt: hoursAgo(1), kind: 'eto', now, assumed: true })).toBe('ESTIMATED')
  })

  it('is CONFLICTING when two readings disagree beyond tolerance', () => {
    expect(classifyValue({ value: 20, source: 'sensor', observedAt: hoursAgo(1), kind: 'soil_moisture', now, conflictsWith: 30 })).toBe('CONFLICTING')
    expect(classifyValue({ value: 20, source: 'sensor', observedAt: hoursAgo(1), kind: 'soil_moisture', now, conflictsWith: 21 })).toBe('KNOWN')
  })
})

describe('makeStatefulValue / usableForCalculation', () => {
  it('carries unit, source and time', () => {
    const v = makeStatefulValue({ value: 24, unit: '% VWC', source: 'sensor', observedAt: hoursAgo(1), kind: 'soil_moisture', now })
    expect(v).toMatchObject({ value: 24, unit: '% VWC', source: 'sensor', state: 'KNOWN' })
    expect(usableForCalculation(v)).toBe(true)
  })

  it('excludes stale, conflicting and unknown values from calculations', () => {
    const stale = makeStatefulValue({ value: 24, unit: '%', source: 'sensor', observedAt: hoursAgo(99), kind: 'soil_moisture', now })
    const unknown = makeStatefulValue({ value: null, unit: '%', source: 'sensor', observedAt: null, kind: 'soil_moisture', now })
    expect(usableForCalculation(stale)).toBe(false)
    expect(usableForCalculation(unknown)).toBe(false)
  })
})
