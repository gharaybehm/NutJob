import { describe, expect, it } from 'vitest'
import { capSingleDose, injectionSafeguards, type InjectionReading } from './fertigation'
import { frostEquipmentSafeguards, frostWaterPriorityDays } from './frost'
import { irrigationSafeguards, type IrrigationLimits } from './irrigation'
import { validateProbe, type ProbeLimits } from './sensor'

const NOW = new Date('2026-05-10T12:00:00Z')
const probeLimits: ProbeLimits = { maxAgeS: 3600, minPlausible: 1, maxPlausible: 60, maxStep: 10 }

/** Readings every 15 minutes ending at `NOW`, oldest first. */
const series = (values: number[], endMinutesAgo = 0) =>
  values.map((value, i) => ({ at: new Date(NOW.getTime() - (endMinutesAgo + (values.length - 1 - i) * 15) * 60_000), value }))

describe('sensor validation (A10.1)', () => {
  it('accepts a live, plausible, moving reading', () => {
    expect(validateProbe(series([24, 24.2, 24.1, 23.9]), NOW, probeLimits)).toEqual({ valid: true, reason: 'OK' })
  })

  it('rejects no data, a stale reading and a reading out of range', () => {
    expect(validateProbe([], NOW, probeLimits).reason).toBe('NO_DATA')
    expect(validateProbe(series([24, 24.1], 120), NOW, probeLimits).reason).toBe('STALE')
    expect(validateProbe(series([24, 75]), NOW, probeLimits).reason).toBe('OUT_OF_RANGE')
  })

  it('rejects a stuck sensor and a sudden jump', () => {
    expect(validateProbe(series(Array.from({ length: 12 }, () => 24)), NOW, probeLimits).reason).toBe('STUCK')
    expect(validateProbe(series([24, 24.1, 40]), NOW, probeLimits).reason).toBe('JUMP')
  })

  it('does not call a short flat series stuck', () => {
    expect(validateProbe(series([24, 24, 24]), NOW, probeLimits).valid).toBe(true)
  })
})

describe('irrigation and hydraulic safeguards (A10.2)', () => {
  const limits: IrrigationLimits = { maxRunMinutes: 240, expectedFlowLpm: 100, burstFactor: 1.5, minFlowLpm: 10, minValidProbes: 2, minAgreeingProbes: 2, emergencyMinutes: 30 }
  const block = { id: 'B1', emergencyFloorVwc: 14 }
  const closed = { isOpen: false, minutesOpen: 0 }
  const types = (cmds: ReturnType<typeof irrigationSafeguards>) => cmds.map(c => c.type)

  // Acceptance test: a stuck probe reading 0 % produces STUCK, triggers no valve command, and puts the block in degraded mode.
  it('a stuck probe at 0 % is rejected, opens no valve and puts the block in degraded mode', () => {
    const stuck = validateProbe(series(Array.from({ length: 12 }, () => 0)), NOW, { ...probeLimits, minPlausible: 0 })
    expect(stuck).toEqual({ valid: false, reason: 'STUCK' })
    const cmds = irrigationSafeguards(block, [{ vwcPct: 0, valid: stuck.valid }], closed, 0, limits)
    expect(types(cmds)).toEqual(['DEGRADED_MODE', 'ALERT'])
    expect(cmds.some(c => c.type === 'OPEN_VALVE_CAPPED' || c.type === 'CLOSE_VALVE')).toBe(false)
  })

  // Acceptance test: a single probe below the floor while the others are normal triggers no emergency irrigation.
  it('one probe below the floor while the others are normal opens no valve', () => {
    const cmds = irrigationSafeguards(block, [{ vwcPct: 10, valid: true }, { vwcPct: 24, valid: true }, { vwcPct: 25, valid: true }], closed, 0, limits)
    expect(cmds).toEqual([])
  })

  it('SG-IRR-3: opens the valve for a capped time when enough valid probes agree', () => {
    const cmds = irrigationSafeguards(block, [{ vwcPct: 10, valid: true }, { vwcPct: 12, valid: true }, { vwcPct: 13, valid: true }], closed, 0, limits)
    expect(cmds[0]).toEqual({ type: 'OPEN_VALVE_CAPPED', blockId: 'B1', minutes: 30 })
  })

  // Acceptance test: a valve open beyond max run time gets closed.
  it('SG-IRR-1: closes a valve open beyond its maximum run time', () => {
    const cmds = irrigationSafeguards(block, [{ vwcPct: 24, valid: true }, { vwcPct: 25, valid: true }], { isOpen: true, minutesOpen: 300 }, 100, limits)
    expect(cmds).toEqual([{ type: 'CLOSE_VALVE', blockId: 'B1' }, { type: 'ALERT', message: 'SG-IRR-1 max run time exceeded' }])
  })

  it('SG-IRR-1: closes a valve on a burst and alerts on an open valve with no flow', () => {
    const probes = [{ vwcPct: 24, valid: true }, { vwcPct: 25, valid: true }]
    expect(types(irrigationSafeguards(block, probes, { isOpen: true, minutesOpen: 20 }, 180, limits))).toEqual(['CLOSE_VALVE', 'ALERT'])
    expect(irrigationSafeguards(block, probes, { isOpen: true, minutesOpen: 20 }, 2, limits)).toEqual([{ type: 'ALERT', message: 'SG-IRR-1 valve open, no flow' }])
  })

  it('checks the hydraulics first even when the probes cannot be trusted', () => {
    const cmds = irrigationSafeguards(block, [], { isOpen: true, minutesOpen: 300 }, 100, limits)
    expect(types(cmds)).toEqual(['CLOSE_VALVE', 'ALERT', 'DEGRADED_MODE', 'ALERT'])
  })
})

describe('fertigation safeguards (A10.4)', () => {
  const limits = { ecMin: 0.5, ecMax: 2.5, phMin: 5.5, phMax: 7.5, minFlowLpm: 10, flushMinutes: 15 }
  const injecting = (over: Partial<InjectionReading> = {}): InjectionReading => ({ injecting: true, inlineEc: 1.8, inlinePh: 6.5, flowLpm: 80, minutesSinceInjection: null, ...over })

  it('lets an injection run inside the band with water flowing', () => {
    expect(injectionSafeguards(injecting(), limits)).toEqual([])
  })

  it('SG-FERT-1: stops injection when the inline EC or pH leaves the band', () => {
    expect(injectionSafeguards(injecting({ inlineEc: 3.1 }), limits)).toMatchObject([{ type: 'STOP_INJECTION', safeguardId: 'SG-FERT-1' }])
    expect(injectionSafeguards(injecting({ inlinePh: 4.9 }), limits)).toMatchObject([{ type: 'STOP_INJECTION', safeguardId: 'SG-FERT-1' }])
  })

  it('SG-FERT-2: stops injection when no water is flowing', () => {
    expect(injectionSafeguards(injecting({ flowLpm: 0 }), limits)[0]).toMatchObject({ type: 'STOP_INJECTION', safeguardId: 'SG-FERT-2' })
  })

  it('stops an injection whose readings are missing', () => {
    expect(injectionSafeguards(injecting({ inlineEc: null, inlinePh: null, flowLpm: null }), limits)).toHaveLength(3)
  })

  it('SG-FERT-2: keeps flushing the lines after an injection', () => {
    expect(injectionSafeguards({ injecting: false, inlineEc: null, inlinePh: null, flowLpm: 80, minutesSinceInjection: 5 }, limits)).toEqual([{ type: 'KEEP_FLUSHING', safeguardId: 'SG-FERT-2', minutesLeft: 10 }])
    expect(injectionSafeguards({ injecting: false, inlineEc: null, inlinePh: null, flowLpm: 80, minutesSinceInjection: 20 }, limits)).toEqual([])
  })

  it('SG-FERT-3: caps a single dose at the maximum', () => {
    expect(capSingleDose(40, 25)).toBe(25)
    expect(capSingleDose(12, 25)).toBe(12)
    expect(capSingleDose(-3, 25)).toBe(0)
  })
})

describe('frost safeguards (A10.5)', () => {
  it('SG-FRO-1: gives frost protection the water on the nights a farm protects with water', () => {
    expect(frostWaterPriorityDays([2, 1, 2], 'water')).toEqual({ days: [1, 2], note: null })
    expect(frostWaterPriorityDays([1], 'wind_machine')).toEqual({ days: [], note: null })
    expect(frostWaterPriorityDays([], null)).toEqual({ days: [], note: null })
  })

  it('SG-FRO-1: says so when the method is not set, and assumes nothing', () => {
    const r = frostWaterPriorityDays([1], null)
    expect(r.days).toEqual([])
    expect(r.note).toMatch(/frost protection method of the farm is not set/)
  })

  it('SG-FRO-2: stops equipment above its wind limit and alerts on a failed start', () => {
    const limits = { maxWindMs: 3, startTimeoutS: 120 }
    expect(frostEquipmentSafeguards({ commandedOn: true, running: true, secondsSinceCommand: 600, windMs: 4 }, limits)).toEqual([{ type: 'STOP', reason: 'SG-FRO-2 wind above the equipment safety limit' }])
    expect(frostEquipmentSafeguards({ commandedOn: true, running: false, secondsSinceCommand: 300, windMs: 1 }, limits)).toEqual([{ type: 'ALERT', message: 'SG-FRO-2 frost equipment did not start' }])
    expect(frostEquipmentSafeguards({ commandedOn: true, running: true, secondsSinceCommand: 600, windMs: 1 }, limits)).toEqual([])
  })
})
