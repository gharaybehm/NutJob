import { describe, expect, it } from 'vitest'
import { evaluateIrrigation, totalAvailableWaterMm, type IrrigationInput } from './irrigation'
import { makeStatefulValue } from '@/utils/value-state'

const now = new Date()
const moisture = (pct: number | null) =>
  makeStatefulValue({ value: pct, unit: '% VWC', source: 'sensor', observedAt: now.toISOString(), kind: 'soil_moisture', now })

const base: IrrigationInput = {
  fieldCapacityPct: 30,
  wiltingPointPct: 12,
  rootDepthM: 1.0,
  moisture: moisture(24),
  stage: 'hull_fill',
  etoToday: 7,
  forecast: [1, 2, 3, 4, 5].map(() => ({ eto: 7, rain: 0 })),
  areaHa: 2,
  remainingAllocationM3: 5000,
  canopyCoverKnown: true,
}

describe('evaluateIrrigation', () => {
  it('computes TAW, RAW and depletion (hand-calculated)', () => {
    // TAW = 10 * (30-12) * 1.0 = 180 mm; RAW = 0.4 * 180 = 72 mm; Dr = 10*(30-24)*1 = 60 mm
    const r = evaluateIrrigation(base)
    expect(r.tawMm).toBe(180)
    expect(r.rawMm).toBe(72)
    expect(r.depletionMm).toBe(60)
    expect(r.etcMmPerDay).toBe(6.3) // Kc 0.9 * 7
  })

  it('recommends irrigating soon when threshold is within 3 days', () => {
    // 60 + 6.3 = 66.3, + 6.3 = 72.6 >= 72 on day 2
    const r = evaluateIrrigation(base)
    expect(r.daysToThreshold).toBe(2)
    expect(r.status).toBe('irrigate_soon')
    expect(r.requirementMm).toBeCloseTo(66.7, 1) // 60 / 0.9
    expect(r.requirementM3).toBeCloseTo(1334, 0) // 66.7 mm * 2 ha * 10
    expect(r.allocationAfterM3).toBeCloseTo(5000 - 1334, 0)
  })

  it('says irrigate now once depletion passes the threshold', () => {
    expect(evaluateIrrigation({ ...base, moisture: moisture(18) }).status).toBe('irrigate_now')
  })

  it('needs no irrigation when the soil is wet', () => {
    const r = evaluateIrrigation({ ...base, moisture: moisture(29), etoToday: 3, forecast: [{ eto: 3, rain: 0 }] })
    expect(r.status).toBe('no_irrigation_needed')
    expect(r.requirementMm).toBe(0)
  })

  it('counts effective rain in the projection, ignoring light showers', () => {
    const rainy = evaluateIrrigation({ ...base, forecast: [{ eto: 7, rain: 20 }, { eto: 7, rain: 0 }, { eto: 7, rain: 0 }] })
    const light = evaluateIrrigation({ ...base, forecast: [{ eto: 7, rain: 3 }, { eto: 7, rain: 0 }, { eto: 7, rain: 0 }] })
    expect(rainy.daysToThreshold).not.toBe(light.daysToThreshold)
    expect(light.daysToThreshold).toBe(2)
  })

  it('asks for data instead of guessing when moisture is unusable', () => {
    const r = evaluateIrrigation({ ...base, moisture: moisture(null) })
    expect(r.status).toBe('data_required')
    expect(r.confidence).toBe('low')
    expect(r.dataGaps.join(' ')).toMatch(/moisture/i)
  })

  it('asks for data when soil parameters are missing', () => {
    expect(evaluateIrrigation({ ...base, rootDepthM: null }).status).toBe('data_required')
  })

  it('reports status against a deficit strategy without changing it', () => {
    const r = evaluateIrrigation({ ...base, strategy: { name: 'planned_deficit', allowableDepletion: 0.6 } })
    expect(r.strategy).toBe('planned_deficit')
    expect(r.rawMm).toBe(108) // 0.6 * 180
    expect(r.status).not.toBe('irrigate_now')
  })

  it('lists data gaps and derives confidence from evidence', () => {
    const r = evaluateIrrigation({ ...base, canopyCoverKnown: false, remainingAllocationM3: null })
    expect(r.dataGaps.join(' ')).toMatch(/stem water potential/)
    expect(r.dataGaps.join(' ')).toMatch(/licence volume/)
    expect(r.dataGaps.join(' ')).toMatch(/Canopy/)
    const withSwp = evaluateIrrigation({ ...base, stemWaterPotentialMpa: -1.4 })
    expect(withSwp.confidence).toBe('high')
  })
})

describe('totalAvailableWaterMm', () => {
  it('is the reserve between field capacity and wilting point over the rooting depth', () => {
    expect(totalAvailableWaterMm(30, 12, 1.0)).toBe(180)
    expect(totalAvailableWaterMm(30, 12, 1.5)).toBe(270)
  })

  it('is null when anything is missing or the thresholds are inverted', () => {
    expect(totalAvailableWaterMm(null, 12, 1)).toBeNull()
    expect(totalAvailableWaterMm(30, 12, null)).toBeNull()
    expect(totalAvailableWaterMm(12, 30, 1)).toBeNull()
  })

  it('agrees with what the engine reports', () => {
    expect(evaluateIrrigation(base).tawMm).toBe(totalAvailableWaterMm(30, 12, 1.0))
  })
})
