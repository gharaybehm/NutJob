/**
 * Crop Knowledge Pack format (CDSS spec Part B, §B2).
 *
 * A pack is a versioned bundle of plain YAML files holding all the science
 * for one crop. This file defines the shape of each section. The platform
 * reads packs; it contains none of their content.
 *
 * Values an engine may calibrate or that still need a source are written as
 * `$parameter` references and defined once in the parameters section.
 */

import { z } from 'zod'

/** Platform version checked against a pack's `min_platform_version` (V1). */
export const PLATFORM_VERSION = '0.1.0'

/** The twelve generic engines (spec §A6). */
export const ENGINE_IDS = [
  'phenology',
  'irrigation',
  'fertigation',
  'salinity',
  'frost',
  'insect_pest',
  'disease',
  'pollination',
  'canopy_pruning',
  'weed_groundcover',
  'yield_forecast',
  'harvest',
] as const
export type EngineId = (typeof ENGINE_IDS)[number]

export const PARAMETER_STATUSES = ['sourced', 'expert estimate', 'to be sourced'] as const
export type ParameterStatus = (typeof PARAMETER_STATUSES)[number]

const semver = z.string().regex(/^\d+\.\d+\.\d+$/, 'must be a version such as 1.2.3')
const paramRef = z.string().regex(/^\$[A-Za-z_][A-Za-z0-9_]*$/, 'must be a $parameter reference')
const temperatureUnit = z.enum(['C', 'F'])

/** Content the pack does not hold yet, listed so the validation report can show it. */
const toBeSourced = z.array(z.object({ item: z.string(), note: z.string().optional() })).default([])
/** A note for the agronomist on a value that needs confirming. */
const review = z.string().optional()

const conditionValue = z.union([z.number(), z.boolean(), z.string(), z.array(z.union([z.number(), z.string()]))])

export const decisionTableSchema = z.object({
  table: z.string(),
  hit_policy: z.literal('first'),
  rows: z
    .array(
      z.object({
        id: z.string(),
        when: z.record(z.string(), conditionValue),
        then: z.record(z.string(), z.unknown()),
        evidence: z.string().optional(),
      }),
    )
    .min(1),
})

const manifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  crop: z.object({ common_name: z.string(), scientific_name: z.string() }),
  version: semver,
  min_platform_version: semver,
  authors: z.array(z.string()).min(1),
  review_date: z.string(),
  regions: z.array(z.string()).min(1),
  region_notes: z.string().optional(),
  licence: z.string(),
  signature: z.string(),
})

const cropSchema = z.object({
  type: z.enum(['perennial', 'annual']),
  harvested_product: z.string(),
  yield_unit: z.string(),
  price_unit: z.string(),
  co_products: z.array(z.string()).default([]),
})

const varietiesSchema = z.object({
  varieties: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      origin: z.string().optional(),
      bloom_class: z.string().optional(),
      self_compatible: z.boolean().optional(),
      polliniser_groups: z.array(z.string()).default([]),
      chill: z.object({ model: z.enum(['dynamic', 'utah', 'chill_hours']), unit: z.string(), requirement: paramRef }).optional(),
      heat: z.object({ model: z.enum(['gdh', 'degree_days']), unit: z.string(), requirement: paramRef }).optional(),
      tolerances: z.record(z.string(), z.string()).default({}),
      maturity_class: z.string().optional(),
      notes: z.string().optional(),
      evidence: z.string().optional(),
      review,
    }),
  ),
  to_be_sourced: toBeSourced,
})

const phenologySchema = z.object({
  scale: z.object({
    id: z.string(),
    name: z.string(),
    evidence: z.string(),
    stages: z.array(z.object({ code: z.string(), name: z.string(), description: z.string().optional() })).min(1),
  }),
  /** The phases the engines use, in season order, each starting at a stage of the scale. */
  phases: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        starts_at_stage: z.union([z.string(), paramRef]),
        /** Stage names the application records today that fall in this phase; used until scouting records the scale itself. */
        recorded_as: z.array(z.string()).default([]),
      }),
    )
    .min(1),
  /** A note for the agronomist on the phase mapping. */
  review,
  models: z
    .array(z.looseObject({ id: z.string(), type: z.enum(['chill_then_heat', 'degree_days', 'day_count']), predicts: z.string(), units: z.string() }))
    .default([]),
  to_be_sourced: toBeSourced,
})

const waterSchema = z.object({
  kcb: z.object({
    method: z.enum(['curve', 'density_coefficient']),
    curve: z.array(z.object({ phase: z.string(), kcb: paramRef })).optional(),
    params: z.object({ ml: paramRef, fr: paramRef, kc_min: paramRef }).optional(),
    evidence: z.string(),
    note: z.string().optional(),
  }),
  depletion_fraction: paramRef,
  root_depth_m: paramRef,
  plant_water_status: z
    .object({
      indicator: z.string(),
      unit: z.string(),
      baseline: z.object({ expression: z.string().nullable(), inputs: z.array(z.string()), evidence: z.string(), note: z.string().optional() }),
      trigger_deviation: paramRef,
    })
    .optional(),
  deficit_strategies: z
    .array(z.object({ id: z.string(), phases: z.array(z.string()), floor: paramRef, fraction: paramRef, switch: z.string(), evidence: z.string() }))
    .default([]),
  rain_deferral_probability: paramRef.optional(),
  decision_table: decisionTableSchema.optional(),
  to_be_sourced: toBeSourced,
})

const nutritionSchema = z.object({
  nutrients: z.array(
    z.object({
      id: z.string(),
      removal_kg_per_kg_yield: paramRef,
      growth_requirement_kg_ha: paramRef.optional(),
      phase_shares: z.array(z.object({ phase: z.string(), share: paramRef, label: z.string().optional() })).optional(),
      notes: z.string().optional(),
      evidence: z.string(),
      review,
    }),
  ),
  efficiency: paramRef,
  sampling: z
    .looseObject({
      tissue: z.string(),
      timing: z.string(),
      /** Calendar months (1-12) in which the sample is taken. */
      months: z.array(z.number().int().min(1).max(12)).optional(),
      evidence: z.string(),
    })
    .optional(),
  tissue_bands: z
    .array(
      z.object({
        nutrient: z.string(),
        tissue: z.string(),
        unit: z.string(),
        deficient_below: z.number().nullable().default(null),
        adequate_from: z.number().nullable().default(null),
        adequate_to: z.number().nullable().default(null),
        excessive_above: z.number().nullable().default(null),
        note: z.string().optional(),
        evidence: z.string(),
        review,
      }),
    )
    .default([]),
  max_single_dose_kg_ha: paramRef.optional(),
  decision_table: decisionTableSchema.optional(),
  to_be_sourced: toBeSourced,
})

const salinitySchema = z.object({
  threshold_ece: paramRef,
  slope_pct_per_ds_m: paramRef,
  unit: z.string(),
  specific_ions: z.array(z.object({ ion: z.string(), limit: paramRef, unit: z.string() })).default([]),
  /** Upper bound on the leaching fraction the irrigation engine may add. */
  leaching_fraction_max: paramRef.optional(),
  notes: z.array(z.string()).default([]),
  evidence: z.string(),
  to_be_sourced: toBeSourced,
})

const criticalTemperature = z.object({ temp_c: paramRef, damage_fraction: z.number().min(0).max(1).nullable() })

const frostSchema = z.object({
  duration_basis: z.string(),
  unit: z.string(),
  active_phases: z.array(z.string()),
  stages: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        phase: z.string().nullable(),
        critical: z.array(criticalTemperature).min(1),
        by_variety: z.record(z.string(), z.array(criticalTemperature).min(1)).default({}),
        evidence: z.string(),
        review,
      }),
    )
    .min(1),
  damage_function: z.object({ loss_fraction_per_degree: paramRef }).nullable(),
  to_be_sourced: toBeSourced,
})

const degreeDayModel = z.object({
  method: z.enum(['single_sine', 'single_triangle', 'averaging']),
  cutoff: z.enum(['horizontal', 'vertical', 'intermediate']),
  lower: z.number(),
  upper: z.number().nullable(),
  units: temperatureUnit,
  evidence: z.string(),
  review,
})

const pestsSchema = z.object({
  pests: z.array(
    z.looseObject({
      id: z.string(),
      name: z.string(),
      monitoring: z.looseObject({ method: z.string() }),
      biofix: z.object({ rule: z.string() }),
      degree_days: degreeDayModel,
      events: z.array(z.object({ id: z.string(), name: z.string(), dd: paramRef })).default([]),
      /** What the field forms ask for (spec R2.2: the pack defines the observations). */
      observations: z
        .array(
          z.object({
            kind: z.string(),
            fields: z.array(z.object({ id: z.string(), label: z.string(), type: z.enum(['number', 'boolean', 'text']) })).min(1),
          }),
        )
        .default([]),
      /** State keys the decision table reads, each computed from the observations. */
      derived: z
        .array(
          z.object({
            key: z.string(),
            /** latest: the newest value. rising_run: checks in a row that rose, ending at the newest. latest_ratio: newest field / newest `over`. */
            stat: z.enum(['latest', 'rising_run', 'latest_ratio']),
            observation: z.string(),
            field: z.string(),
            over: z.string().optional(),
          }),
        )
        .default([]),
      decision_table: decisionTableSchema.optional(),
      evidence: z.string(),
      to_be_sourced: toBeSourced,
    }),
  ),
  to_be_sourced: toBeSourced,
})

const infectionDisease = z.looseObject({
  id: z.string(),
  name: z.string(),
  type: z.literal('infection_value'),
  units: temperatureUnit,
  /** Local hour at which the day's value is computed, and the hours it looks back over. */
  evaluation: z.object({ hour: z.number().int().min(0).max(23), window_hours: z.number().int().positive() }),
  dry_hours_split: z.number().int().positive(),
  aggregate: z.enum(['max', 'sum']),
  bands: z.array(z.object({ tmin: z.number(), tmax: z.number(), steps: z.array(z.tuple([z.number(), z.number()])).min(1) })).min(1),
  accumulation_days: z.number().int().positive(),
  threshold: paramRef,
  reset_on_spray: z.boolean(),
  active_phases: z.array(z.string()).nullable(),
  decision_table: decisionTableSchema.optional(),
  evidence: z.string(),
})

const timedDisease = z.looseObject({
  id: z.string(),
  name: z.string(),
  type: z.literal('phenology_timed'),
  anchor_event: z.string(),
  timings: z.array(z.object({ label: z.string(), offset_days: z.tuple([z.number(), z.number()]) })).min(1),
  resistance: z.object({ rule: z.string(), max_consecutive_same_group: paramRef.optional() }).optional(),
  decision_table: decisionTableSchema.optional(),
  evidence: z.string(),
})

const culturalDisease = z.looseObject({
  id: z.string(),
  name: z.string(),
  type: z.literal('cultural_risk'),
  phase: z.string(),
  drivers: z.array(z.object({ state_key: z.string(), effect: z.string() })).min(1),
  decision_table: decisionTableSchema.optional(),
  evidence: z.string().nullable(),
})

const diseasesSchema = z.object({
  diseases: z.array(z.discriminatedUnion('type', [infectionDisease, timedDisease, culturalDisease])),
  to_be_sourced: toBeSourced,
})

const SEASONAL_ENGINES = ['pollination', 'canopy_pruning', 'weed_groundcover', 'harvest'] as const

/** When a seasonal task falls due (spec §A5.5: dated tasks from templates, adjusted by phenology and weather). */
const templateAnchor = z.discriminatedUnion('type', [
  /** Due while the block is in a phase. */
  z.object({ type: z.literal('phase'), phase: z.string() }),
  /** Due a number of days before or after a dated event, such as petal fall or the planned harvest. */
  z.object({ type: z.literal('event'), event: z.string(), offset_days: z.tuple([z.number(), z.number()]) }),
  /** Due in calendar months (1-12). */
  z.object({ type: z.literal('months'), months: z.array(z.number().int().min(1).max(12)).min(1) }),
])

const seasonalTemplate = z.object({
  id: z.string(),
  task: z.string(),
  anchor: templateAnchor,
  /** Block ages, in whole years since planting, the task applies to. */
  age: z.object({ min_years: z.number().optional(), max_years: z.number().optional() }).optional(),
  /** Weather gate: dry days needed from the day of the task. */
  dry_days: paramRef.optional(),
  /** Pack id the task sprays against; such a task goes through the spray safeguards. */
  spray_target: z.string().optional(),
  evidence: z.string().optional(),
})

const seasonalSchema = z.partialRecord(
  z.enum(SEASONAL_ENGINES),
  z.object({
    summary: z.string(),
    templates: z.array(seasonalTemplate).default([]),
    params: z.record(z.string(), paramRef).default({}),
    /** Pollination: hives per hectare, and the weather pollinators fly in. */
    hive_density_per_ha: paramRef.optional(),
    flight: z.object({ min_temp_c: paramRef, max_wind_ms: paramRef }).optional(),
    /** Harvest: the observations that show the crop is ready, each with its threshold. */
    maturity: z
      .array(z.object({ observation: z.string(), field: z.string(), comparison: z.enum(['ge', 'le']), ready_at: paramRef }))
      .default([]),
    /** Harvest: days before the planned harvest at which irrigation stops. */
    irrigation_cutoff_days: paramRef.optional(),
    /** Pollination only: phases in which bee-toxic products are vetoed (safeguard SG-SPR-8). */
    bee_protection_phases: z.array(z.string()).default([]),
    to_be_sourced: toBeSourced,
  }),
)

const yieldSchema = z.object({
  model: z.string(),
  components: z.array(z.string()).min(1),
  early_indicators: z.array(z.string()).default([]),
  /** Fraction of the mature yield by age, for a block with no estimate of its own. */
  age_curve: z.array(z.object({ age_years: z.number().min(0), fraction: paramRef })).default([]),
  /** Coefficient of variation of the prior estimate. */
  prior_cv: paramRef.optional(),
  to_be_sourced: toBeSourced,
})

const couplingsSchema = z.object({
  couplings: z.array(
    z.object({
      id: z.string(),
      from: z.string(),
      to: z.string(),
      rule: z.string(),
      phase: z.string().optional(),
      decision_table: decisionTableSchema.optional(),
    }),
  ),
  to_be_sourced: toBeSourced,
})

/** Strict: a mistyped or mis-quoted field is an error, not silently dropped. */
export const parameterSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  /** Null only while the value is still to be sourced. */
  start: z.number().nullable(),
  unit: z.string().min(1),
  bounds: z.tuple([z.number(), z.number()]).nullable(),
  status: z.enum(PARAMETER_STATUSES),
  evidence: z.string().nullable(),
  note: z.string().optional(),
  review,
})

const parametersSchema = z.object({ parameters: z.array(parameterSchema) })

const metricsSchema = z.object({
  metrics: z.partialRecord(z.enum(ENGINE_IDS), z.array(z.object({ id: z.string(), description: z.string(), unit: z.string() }))),
})

const evidenceSchema = z.object({ evidence: z.record(z.string(), z.string()) })

export const packTestCaseSchema = z.looseObject({
  id: z.string(),
  kind: z.enum(['table', 'degree_days', 'infection', 'relative_yield', 'nutrient_demand', 'phase_shares', 'frost', 'water_status']),
  tolerance: z.number().positive().optional(),
})
export type PackTestCase = z.infer<typeof packTestCaseSchema>

const testsSchema = z.array(packTestCaseSchema).min(1)

/** Sections marked required in spec §B2 are not optional here. */
export const packSchema = z.object({
  manifest: manifestSchema,
  crop: cropSchema,
  varieties: varietiesSchema.optional(),
  phenology: phenologySchema,
  water: waterSchema.optional(),
  nutrition: nutritionSchema.optional(),
  salinity: salinitySchema.optional(),
  frost: frostSchema.optional(),
  pests: pestsSchema.optional(),
  diseases: diseasesSchema.optional(),
  seasonal: seasonalSchema.optional(),
  yield: yieldSchema.optional(),
  couplings: couplingsSchema.optional(),
  parameters: parametersSchema,
  metrics: metricsSchema.optional(),
  evidence: evidenceSchema,
  tests: testsSchema,
})

export type Pack = z.infer<typeof packSchema>
export type PackParameter = z.infer<typeof parameterSchema>
export type PackSection = Exclude<keyof Pack, 'manifest' | 'tests'>

/** One YAML file per section; the file name is the section name. */
export const PACK_SECTIONS = Object.keys(packSchema.shape).filter(k => k !== 'tests') as (keyof Pack)[]

/**
 * Which engine each pack section feeds. Seasonal templates are keyed by
 * engine inside their section, so they are resolved separately.
 */
export const SECTION_ENGINE: Partial<Record<keyof Pack, EngineId>> = {
  varieties: 'phenology',
  phenology: 'phenology',
  water: 'irrigation',
  nutrition: 'fertigation',
  salinity: 'salinity',
  frost: 'frost',
  pests: 'insect_pest',
  diseases: 'disease',
  yield: 'yield_forecast',
}
