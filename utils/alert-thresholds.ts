/**
 * The Thresholds view in Settings: every limit the alerts and the irrigation
 * advice use for a farm, with where each one comes from.
 *
 * - Farm settings (`farm_policy`), or the starting value when none is saved.
 * - Block settings (field capacity, wilting point, root depth), with a
 *   suggestion from the block's soil test texture (engines/soil-hydraulics).
 * - Values built into the live engines (frost damage temperatures, effective
 *   rain, the heat flag), read from those engines so the view cannot drift.
 * - The bound crop pack's values with their status, for comparison. Only the
 *   shadow decision engine uses them today.
 *
 * Plain module, no database access: the settings page loads the rows and this
 * builds the view, so it can be tested.
 */

import type { Pack, ParameterStatus } from '@/engines/pack/schema'
import { POLICY_DEFAULTS } from '@/utils/farm-policy'
import { cropSupports } from '@/utils/crops'
import { frostThresholdFor, type FrostBasis } from '@/engines/weather-risk'
import { totalAvailableWaterMm, EFFECTIVE_RAIN_MIN_MM, EFFECTIVE_RAIN_FRACTION } from '@/engines/irrigation'
import { HEAT_STRESS_FLAG_ABOVE_C } from '@/engines/weather-flags'
import { estimateWaterLimits, type WaterLimitsEstimate } from '@/engines/soil-hydraulics'

export interface ThresholdPolicyRow {
  allowable_depletion: number | string | null
  frost_margin_c: number | string | null
  sensor_failed_after_hours: number | null
  default_root_depth_m: number | string | null
}

export interface ThresholdBlockRow {
  id: string
  name: string
  crop_type: string | null
  variety: string | null
  field_capacity: number | string | null
  wilting_point: number | string | null
  root_depth_m: number | string | null
  pack_id: string | null
  pack_version: string | null
  pack_variety_id: string | null
}

export interface SoilTestRow {
  id: string
  block_id: string | null
  recorded_at: string
  parameters: Record<string, unknown> | null
}

/** A pack value as the pack states it. Value is null while it is to be sourced. */
export interface PackValue {
  value: number | null
  unit: string
  status: ParameterStatus
  bounds: [number, number] | null
  evidence: string | null
}

export interface FarmSetting {
  value: number
  /** True when the farm has saved nothing and the starting value applies. */
  isDefault: boolean
}

export interface PackThresholds {
  key: string
  cropName: string
  version: string
  depletion: PackValue | null
  /** True when the farm's allowable depletion is outside this pack's bounds. */
  depletionOutsideBounds: boolean
  rootDepth: PackValue | null
  rainDeferProbability: PackValue | null
  frostStages: {
    name: string
    critical: { temp: PackValue | null; damageFraction: number | null }[]
    /** Variety names (from the pack) that have values of their own at this stage. */
    varietiesWithOwnValues: string[]
  }[]
  pests: { name: string; events: { name: string; degreeDays: PackValue | null }[] }[]
}

export interface LiveFrostStage {
  stage: 'bloom' | 'fruit_set'
  lt10: number
  lt50: number | null
  lt90: number | null
  basis: FrostBasis
  source: string
  /** A frost warning is raised when the forecast minimum is at or below this. */
  warningAtC: number
}

export interface SoilSuggestion {
  testId: string
  recordedAt: string
  /** 'farm' when the test was logged for the whole farm, not this block. */
  scope: 'block' | 'farm'
  textureClass: string | null
  sandPct: number | null
  clayPct: number | null
  organicMatterPct: number | null
  estimate: WaterLimitsEstimate
}

export interface BlockThresholds {
  id: string
  name: string
  crop: string | null
  variety: string | null
  fieldCapacityPct: number | null
  wiltingPointPct: number | null
  rootDepth: { value: number | null; from: 'block' | 'farm' | 'none' }
  /** Water between field capacity and wilting point over the root depth (mm). */
  reserveMm: number | null
  /** The irrigate-now alert fires when this much of the reserve is used (mm). */
  irrigateAtDepletionMm: number | null
  /** Null when the crop has no frost data loaded, so no frost alert runs. */
  frost: LiveFrostStage[] | null
  packKey: string | null
  /** The newest soil test with texture data, or null when there is none. */
  soil: SoilSuggestion | null
}

export interface ThresholdView {
  farm: {
    allowableDepletion: FarmSetting
    frostMarginC: FarmSetting
    sensorFailedAfterHours: FarmSetting
    defaultRootDepthM: number | null
    effectiveRain: { minMm: number; fraction: number }
    heatFlagAboveC: number
  }
  packs: PackThresholds[]
  blocks: BlockThresholds[]
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function setting(v: unknown, fallback: number): FarmSetting {
  const n = num(v)
  return n === null ? { value: fallback, isDefault: true } : { value: n, isDefault: false }
}

export const packKey = (id: string, version: string) => `${id}@${version}`

/** Resolve a `$name` reference against the pack's parameters. Null when the pack does not define it. */
function packValue(pack: Pack, ref: string | undefined): PackValue | null {
  if (!ref) return null
  const p = pack.parameters.parameters.find(x => `$${x.id}` === ref)
  if (!p) return null
  return { value: p.start, unit: p.unit, status: p.status, bounds: p.bounds, evidence: p.evidence }
}

export function packThresholds(key: string, pack: Pack, allowableDepletion: number): PackThresholds {
  const depletion = packValue(pack, pack.water?.depletion_fraction)
  const bounds = depletion?.bounds
  const varietyName = (id: string) => pack.varieties?.varieties.find(v => v.id === id)?.name ?? id
  return {
    key,
    cropName: pack.manifest.crop.common_name,
    version: pack.manifest.version,
    depletion,
    depletionOutsideBounds: bounds ? allowableDepletion < bounds[0] || allowableDepletion > bounds[1] : false,
    rootDepth: packValue(pack, pack.water?.root_depth_m),
    rainDeferProbability: packValue(pack, pack.water?.rain_deferral_probability),
    frostStages: (pack.frost?.stages ?? []).map(s => ({
      name: s.name,
      critical: s.critical.map(c => ({ temp: packValue(pack, c.temp_c), damageFraction: c.damage_fraction })),
      varietiesWithOwnValues: Object.keys(s.by_variety).map(varietyName),
    })),
    pests: (pack.pests?.pests ?? []).map(p => ({
      name: p.name,
      events: p.events.map(e => ({ name: e.name, degreeDays: packValue(pack, e.dd) })),
    })),
  }
}

/** The newest soil test for the block with texture data; a whole-farm test only when the block has none. */
function soilSuggestion(blockId: string, tests: SoilTestRow[]): SoilSuggestion | null {
  const hasTexture = (t: SoilTestRow) => num(t.parameters?.sand) !== null || num(t.parameters?.clay) !== null
  const newest = (rows: SoilTestRow[]) => [...rows].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0]
  const own = newest(tests.filter(t => t.block_id === blockId && hasTexture(t)))
  const test = own ?? newest(tests.filter(t => t.block_id === null && hasTexture(t)))
  if (!test) return null
  const p = test.parameters ?? {}
  const sandPct = num(p.sand)
  const clayPct = num(p.clay)
  const organicMatterPct = num(p.organic_matter)
  return {
    testId: test.id,
    recordedAt: test.recorded_at,
    scope: own ? 'block' : 'farm',
    textureClass: typeof p.texture_class === 'string' && p.texture_class.trim() !== '' ? p.texture_class.trim() : null,
    sandPct,
    clayPct,
    organicMatterPct,
    estimate: estimateWaterLimits({ sandPct, clayPct, organicMatterPct }),
  }
}

/** Two decimals: the frost check compares exactly, so the shown value must not be rounded further. */
const round2 = (n: number) => Math.round(n * 100) / 100

export function buildThresholdView(input: {
  policy: ThresholdPolicyRow | null
  blocks: ThresholdBlockRow[]
  packs: Map<string, Pack>
  soilTests: SoilTestRow[]
}): ThresholdView {
  const d = POLICY_DEFAULTS
  const depletion = setting(input.policy?.allowable_depletion, d.allowableDepletion)
  const frostMargin = setting(input.policy?.frost_margin_c, d.frostMarginC)
  const defaultRootDepthM = num(input.policy?.default_root_depth_m)

  const blocks: BlockThresholds[] = input.blocks.map(b => {
    const fc = num(b.field_capacity)
    const wp = num(b.wilting_point)
    const own = num(b.root_depth_m)
    const rootDepth = own !== null
      ? { value: own, from: 'block' as const }
      : defaultRootDepthM !== null ? { value: defaultRootDepthM, from: 'farm' as const } : { value: null, from: 'none' as const }
    const reserve = totalAvailableWaterMm(fc, wp, rootDepth.value)
    // The same stage thresholds the daily snapshot uses, for the two stages frost is checked in.
    const frost = cropSupports(b.crop_type, 'frost')
      ? (['bloom', 'fruit_set'] as const).flatMap(stage => {
          const th = frostThresholdFor(stage, b.variety)
          return th ? [{ stage, lt10: th.lt10, lt50: th.lt50, lt90: th.lt90, basis: th.basis, source: th.source, warningAtC: round2(th.lt10 + frostMargin.value) }] : []
        })
      : null
    return {
      id: b.id,
      name: b.name,
      crop: b.crop_type,
      variety: b.variety,
      fieldCapacityPct: fc,
      wiltingPointPct: wp,
      rootDepth,
      reserveMm: reserve === null ? null : Math.round(reserve),
      irrigateAtDepletionMm: reserve === null ? null : Math.round(reserve * depletion.value),
      frost,
      packKey: b.pack_id && b.pack_version && input.packs.has(packKey(b.pack_id, b.pack_version)) ? packKey(b.pack_id, b.pack_version) : null,
      soil: soilSuggestion(b.id, input.soilTests),
    }
  })

  const usedPacks = [...new Set(blocks.map(b => b.packKey).filter((k): k is string => k !== null))].sort()
  return {
    farm: {
      allowableDepletion: depletion,
      frostMarginC: frostMargin,
      sensorFailedAfterHours: setting(input.policy?.sensor_failed_after_hours, d.sensorFailedAfterHours),
      defaultRootDepthM,
      effectiveRain: { minMm: EFFECTIVE_RAIN_MIN_MM, fraction: EFFECTIVE_RAIN_FRACTION },
      heatFlagAboveC: HEAT_STRESS_FLAG_ABOVE_C,
    },
    packs: usedPacks.map(k => packThresholds(k, input.packs.get(k)!, depletion.value)),
    blocks,
  }
}

/**
 * The bounds a farm's allowable depletion must stay within: those of every
 * pack its blocks are bound to. A value outside any of them is refused, so the
 * live advice and the pack cannot disagree on how dry a block may get.
 */
export function depletionBoundsViolation(value: number, packs: Pack[]): { cropName: string; version: string; bounds: [number, number] } | null {
  for (const pack of packs) {
    const bounds = packValue(pack, pack.water?.depletion_fraction)?.bounds
    if (bounds && (value < bounds[0] || value > bounds[1])) {
      return { cropName: pack.manifest.crop.common_name, version: pack.manifest.version, bounds }
    }
  }
  return null
}
