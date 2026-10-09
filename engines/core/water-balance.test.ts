import { describe, expect, it } from 'vitest'
import {
  assimilateMeasuredDepletion,
  depletionFromWaterContent,
  modelSensorDivergence,
  stepWaterBalance,
  totalAvailableWater,
  totalEvaporableWater,
  type WaterBalanceDay,
  type WaterBalanceState,
} from './water-balance'
import reference from './__fixtures__/water-balance-pyfao56.json'

const soil = { thetaFC: 0.3, thetaWP: 0.15, zeM: 0.1, rewMm: 8, pBase: 0.4 }

const day = (over: Partial<WaterBalanceDay> = {}): WaterBalanceDay => ({
  et0: 5,
  rain: 0,
  irrigation: 0,
  efficiency: 1,
  fwIrrigation: null,
  kcb: 0.9,
  heightM: 3,
  fc: 0.5,
  rootDepthM: 1,
  wind2m: 2,
  rhMin: 45,
  ...over,
})

describe('soil water quantities', () => {
  it('TAW = 1000 (FC - WP) Zr', () => {
    expect(totalAvailableWater(0.3, 0.15, 1.2)).toBeCloseTo(180, 10)
  })

  it('TEW = 1000 (FC - 0.5 WP) Ze', () => {
    expect(totalEvaporableWater(soil)).toBeCloseTo(22.5, 10)
  })

  it('depletion from a measured water content, held between 0 and TAW', () => {
    expect(depletionFromWaterContent(0.24, 0.3, 0.15, 1)).toBeCloseTo(60, 10)
    expect(depletionFromWaterContent(0.35, 0.3, 0.15, 1)).toBe(0)
    expect(depletionFromWaterContent(0.05, 0.3, 0.15, 1)).toBeCloseTo(150, 10)
  })
})

describe('stepWaterBalance against pyfao56', () => {
  it('reproduces 120 days of the pyfao56 model', () => {
    let state: WaterBalanceState = { ...reference.initial }
    reference.days.forEach((d, i) => {
      const r = stepWaterBalance(state, d.in as WaterBalanceDay, reference.soil)
      const got: Record<string, number> = {
        Kcmax: r.kcMax,
        few: r.few,
        Kr: r.kr,
        Ke: r.ke,
        E: r.evaporation,
        ETc: r.etc,
        TAW: r.taw,
        p: r.p,
        RAW: r.raw,
        Ks: r.ks,
        ETa: r.eta,
        DP: r.deepPercolation,
        Dr: r.state.Dr,
        De: r.state.De,
        fw: r.state.fw,
      }
      for (const [key, expected] of Object.entries(d.out)) {
        // The reference inputs are stored to 6 decimals; the largest drift over the run is 0.0013 mm.
        expect(Math.abs(got[key] - expected), `day ${i} ${key}: ${got[key]} vs pyfao56 ${expected}`).toBeLessThan(0.005)
      }
      state = r.state
    })
  })
})

describe('stepWaterBalance behaviour', () => {
  it('has no stress while depletion is below RAW', () => {
    const r = stepWaterBalance({ Dr: 20, De: 22.5, fw: 1 }, day(), soil)
    expect(r.ks).toBe(1)
    expect(r.eta).toBeCloseTo(r.etc, 10)
  })

  it('reduces transpiration once depletion passes RAW', () => {
    const r = stepWaterBalance({ Dr: 120, De: 22.5, fw: 1 }, day(), soil)
    expect(r.ks).toBeLessThan(1)
    expect(r.eta).toBeLessThan(r.etc)
  })

  it('sends water beyond field capacity to deep percolation', () => {
    const r = stepWaterBalance({ Dr: 10, De: 5, fw: 1 }, day({ rain: 60 }), soil)
    expect(r.state.Dr).toBe(0)
    expect(r.deepPercolation).toBeGreaterThan(0)
  })

  it('counts only the efficient part of an irrigation', () => {
    const full = stepWaterBalance({ Dr: 60, De: 22.5, fw: 1 }, day({ irrigation: 30, efficiency: 1, fwIrrigation: 0.4 }), soil)
    const lossy = stepWaterBalance({ Dr: 60, De: 22.5, fw: 1 }, day({ irrigation: 30, efficiency: 0.5, fwIrrigation: 0.4 }), soil)
    expect(lossy.state.Dr).toBeGreaterThan(full.state.Dr)
  })

  it('needs the wetted fraction on an irrigation day', () => {
    expect(() => stepWaterBalance({ Dr: 60, De: 22.5, fw: 1 }, day({ irrigation: 30 }), soil)).toThrow(/fwIrrigation/)
  })

  it('keeps p constant when asked', () => {
    const r = stepWaterBalance({ Dr: 20, De: 22.5, fw: 1 }, day({ et0: 9 }), { ...soil, constantP: true })
    expect(r.p).toBe(0.4)
  })
})

describe('sensor fusion', () => {
  it('replaces the modelled depletion with a validated measurement and reports the gap', () => {
    expect(assimilateMeasuredDepletion(50, 62, 150)).toEqual({ Dr: 62, gapMm: 12, corrected: true })
  })

  it('keeps the model when there is no measurement', () => {
    expect(assimilateMeasuredDepletion(50, null, 150)).toEqual({ Dr: 50, gapMm: 0, corrected: false })
  })

  it('flags divergence only when the gap persists in one direction', () => {
    expect(modelSensorDivergence([12, 15, 11], 10, 3)).toBe(true)
    expect(modelSensorDivergence([-12, -15, -11], 10, 3)).toBe(true)
    expect(modelSensorDivergence([12, -15, 11], 10, 3)).toBe(false)
    expect(modelSensorDivergence([12, 4, 11], 10, 3)).toBe(false)
    expect(modelSensorDivergence([12, 15], 10, 3)).toBe(false)
  })
})
