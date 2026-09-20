import { describe, expect, it } from 'vitest'
import { toEngineStages } from './stage-map'
import { KC_BY_STAGE } from '@/engines/irrigation'
import { frostThresholdFor } from '@/engines/weather-risk'

const DB_STAGES = [
  'dormancy', 'bud-swell', 'bud-break', 'bloom', 'petal-fall',
  'nut-development', 'hull-split', 'harvest', 'post-harvest',
]

describe('toEngineStages', () => {
  it('maps every database stage to an irrigation stage the engine has a Kc for', () => {
    for (const s of DB_STAGES) {
      const { irrigation } = toEngineStages(s)
      expect(irrigation, s).not.toBeNull()
      expect(irrigation! in KC_BY_STAGE, `${s} -> ${irrigation}`).toBe(true)
    }
  })

  it('maps frost stages the engine has thresholds for, and only those', () => {
    for (const s of DB_STAGES) {
      const { frost } = toEngineStages(s)
      if (frost !== null) expect(frostThresholdFor(frost, 'Vairo'), s).not.toBeNull()
    }
    expect(toEngineStages('bloom').frost).toBe('bloom')
    expect(toEngineStages('petal-fall').frost).toBe('fruit_set')
    expect(toEngineStages('nut-development').frost).toBe('fruit_set')
    expect(toEngineStages('hull-split').frost).toBeNull()
  })

  it('says so when a frost-sensitive stage has no sourced thresholds', () => {
    expect(toEngineStages('bud-break').notes[0]).toMatch(/not assessed/)
    expect(toEngineStages('bloom').notes).toEqual([])
  })

  it('returns nothing for an unknown or missing stage', () => {
    expect(toEngineStages(null)).toEqual({ irrigation: null, frost: null, notes: [] })
    expect(toEngineStages('sprouting')).toEqual({ irrigation: null, frost: null, notes: [] })
  })
})
