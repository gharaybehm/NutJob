/**
 * A small, complete pack for a made-up crop, with every value present, so
 * the engines can be tested without any real crop's content.
 */

import { createPackContext, type PackContext } from '../../pack/context'
import { packSchema } from '../../pack/schema'

export function demoPackRaw() {
  return {
    manifest: {
      id: 'demo',
      crop: { common_name: 'Demo crop', scientific_name: 'Exemplum exempli' },
      version: '1.0.0',
      min_platform_version: '0.1.0',
      authors: ['Test'],
      review_date: '2026-01-01',
      regions: ['Anywhere'],
      licence: 'Test',
      signature: 'sha256:demo',
    },
    crop: { type: 'perennial', harvested_product: 'fruit', yield_unit: 'kg/ha', price_unit: 'per kg' },
    varieties: { varieties: [{ id: 'hardy', name: 'Hardy' }, { id: 'plain', name: 'Plain' }] },
    phenology: {
      scale: { id: 'simple', name: 'Simple scale', evidence: 'SRC', stages: [{ code: '1', name: 'Growing' }] },
      phases: [
        { id: 'resting', name: 'Resting', starts_at_stage: '0', recorded_as: ['asleep'] },
        { id: 'flowering', name: 'Flowering', starts_at_stage: '1', recorded_as: ['flowers'] },
        { id: 'growing', name: 'Growing', starts_at_stage: '2', recorded_as: ['leafy', 'fruiting'] },
      ],
    },
    water: {
      kcb: {
        method: 'curve',
        curve: [
          { phase: 'resting', kcb: '$kcb_resting' },
          { phase: 'flowering', kcb: '$kcb_growing' },
          { phase: 'growing', kcb: '$kcb_growing' },
        ],
        evidence: 'SRC',
      },
      depletion_fraction: '$p',
      root_depth_m: '$root_depth_m',
      deficit_strategies: [{ id: 'saver', phases: ['growing'], floor: '$deficit_floor', fraction: '$deficit_fraction', switch: 'deficit_enabled', evidence: 'SRC' }],
      decision_table: {
        table: 'irrigation',
        hit_policy: 'first',
        rows: [
          { id: 'D-0', when: { phase: 'resting' }, then: { action: 'none' } },
          { id: 'D-1', when: { rain_48h_mm_ge: 'Dr', rain_prob_ge: '$rain_defer' }, then: { action: 'defer', note: 'Rain expected' }, evidence: 'SRC' },
          { id: 'D-2', when: { phase: 'growing', deficit_enabled: true }, then: { action: 'irrigate_partial', amount: '$deficit_fraction * ETc_since_last' }, evidence: 'SRC' },
          { id: 'D-3', when: { phase_in: ['flowering', 'growing'], Dr_ge: 'RAW' }, then: { action: 'irrigate', amount: 'Dr / efficiency * (1 + leaching_fraction)' }, evidence: 'SRC' },
          { id: 'D-4', when: {}, then: { action: 'hold', note: 'Depletion below the threshold' } },
        ],
      },
    },
    frost: {
      duration_basis: 'Thirty minutes',
      unit: 'degC',
      active_phases: ['flowering'],
      stages: [
        {
          id: 'open_flowers',
          name: 'Open flowers',
          phase: 'flowering',
          critical: [{ temp_c: '$frost_flower_c', damage_fraction: null }],
          by_variety: {
            hardy: [
              { temp_c: '$frost_hardy_10_c', damage_fraction: 0.1 },
              { temp_c: '$frost_hardy_90_c', damage_fraction: 0.9 },
            ],
          },
          evidence: 'SRC',
        },
      ],
      damage_function: null,
    },
    yield: {
      model: 'units per plant x unit weight',
      components: ['units_per_plant', 'unit_weight'],
      age_curve: [
        { age_years: 3, fraction: '$yield_age3' },
        { age_years: 6, fraction: '$yield_age6' },
      ],
      prior_cv: '$yield_cv',
    },
    nutrition: {
      nutrients: [
        {
          id: 'N',
          removal_kg_per_kg_yield: '$n_removal',
          growth_requirement_kg_ha: '$n_growth',
          phase_shares: [
            { phase: 'flowering', share: '$n_share_flowering' },
            { phase: 'growing', share: '$n_share_growing' },
          ],
          evidence: 'SRC',
        },
        { id: 'K', removal_kg_per_kg_yield: '$k_removal', evidence: 'SRC' },
      ],
      efficiency: '$fert_efficiency',
      sampling: { tissue: 'leaf', timing: 'Midsummer', months: [7], evidence: 'SRC' },
      tissue_bands: [
        { nutrient: 'N', tissue: 'leaf', unit: '%', deficient_below: 2.0, adequate_from: 2.2, adequate_to: 2.5, excessive_above: 2.7, evidence: 'SRC' },
        { nutrient: 'K', tissue: 'husk', unit: '%', deficient_below: 1.0, adequate_from: 1.4, evidence: 'SRC' },
      ],
      max_single_dose_kg_ha: '$max_dose',
    },
    salinity: {
      threshold_ece: '$sal_threshold',
      slope_pct_per_ds_m: '$sal_slope',
      unit: 'dS/m',
      leaching_fraction_max: '$leaching_max',
      evidence: 'SRC',
    },
    pests: {
      pests: [
        {
          id: 'grub',
          name: 'Demo grub',
          monitoring: { method: 'Traps' },
          biofix: { rule: 'Counts rise on two checks in a row, or half the traps have a catch.' },
          degree_days: { method: 'single_sine', cutoff: 'horizontal', lower: 10, upper: 30, units: 'C', evidence: 'SRC' },
          observations: [
            { kind: 'trap_check', fields: [{ id: 'count', label: 'Catch', type: 'number' }, { id: 'traps', label: 'Traps', type: 'number' }, { id: 'traps_with', label: 'Traps with a catch', type: 'number' }] },
            { kind: 'ripeness', fields: [{ id: 'pct', label: 'Ripe (%)', type: 'number' }] },
          ],
          derived: [
            { key: 'rising', stat: 'rising_run', observation: 'trap_check', field: 'count' },
            { key: 'share', stat: 'latest_ratio', observation: 'trap_check', field: 'traps_with', over: 'traps' },
            { key: 'ripeness', stat: 'latest', observation: 'ripeness', field: 'pct' },
          ],
          events: [{ id: 'flight', name: 'Flight', dd: '$grub_dd_flight' }],
          evidence: 'SRC',
          decision_table: {
            table: 'grub',
            hit_policy: 'first',
            rows: [
              { id: 'G-1', when: { biofix_set: false, rising_ge: 2 }, then: { action: 'set_biofix', date: 'first_of_rising_checks' }, evidence: 'SRC' },
              { id: 'G-1b', when: { biofix_set: false, share_ge: 0.5 }, then: { action: 'set_biofix', date: 'check_date' }, evidence: 'SRC' },
              { id: 'G-2', when: { biofix_set: false }, then: { action: 'monitor', task: 'Check traps weekly' } },
              { id: 'G-3', when: { dd_C_ge: '$grub_dd_flight', ripeness_ge: '$ripeness_start' }, then: { action: 'spray', timing: 'now' }, evidence: 'SRC' },
              { id: 'G-4', when: { dd_C_ge: '$grub_dd_flight - 50' }, then: { action: 'prepare', task: 'Confirm product and sprayer' } },
              { id: 'G-5', when: {}, then: { action: 'monitor', task: 'Keep checking traps' } },
            ],
          },
        },
      ],
    },
    diseases: {
      diseases: [
        {
          id: 'blight',
          name: 'Demo blight',
          type: 'infection_value',
          units: 'C',
          evaluation: { hour: 11, window_hours: 23 },
          dry_hours_split: 2,
          aggregate: 'max',
          bands: [{ tmin: 10, tmax: 30, steps: [[3, 1], [6, 2]] }],
          accumulation_days: 7,
          threshold: '$blight_threshold',
          reset_on_spray: true,
          active_phases: ['growing'],
          evidence: 'SRC',
        },
        {
          id: 'spot',
          name: 'Demo spot',
          type: 'phenology_timed',
          anchor_event: 'petal_fall',
          timings: [
            { label: 'At petal fall', offset_days: [0, 0] },
            { label: 'Two to three weeks later', offset_days: [14, 21] },
          ],
          resistance: { rule: 'Rotate groups.', max_consecutive_same_group: '$spot_max_consecutive' },
          evidence: 'SRC',
        },
        {
          id: 'rot',
          name: 'Demo rot',
          type: 'cultural_risk',
          phase: 'growing',
          drivers: [{ state_key: 'Ks', effect: 'A mild water deficit lowers the risk.' }],
          evidence: null,
        },
      ],
    },
    seasonal: { pollination: { summary: 'Bees are protected while flowers are open.', bee_protection_phases: ['flowering'] } },
    parameters: {
      parameters: [
        { id: 'grub_dd_flight', start: 200, unit: 'degree-days C', bounds: [150, 250], status: 'sourced', evidence: 'SRC' },
        { id: 'ripeness_start', start: 1, unit: '%', bounds: [1, 5], status: 'sourced', evidence: 'SRC' },
        { id: 'blight_threshold', start: 4, unit: 'units over 7 days', bounds: [3, 6], status: 'sourced', evidence: 'SRC' },
        { id: 'spot_max_consecutive', start: 2, unit: 'applications', bounds: [1, 3], status: 'sourced', evidence: 'SRC' },
        { id: 'yield_age3', start: 0.3, unit: 'fraction', bounds: [0.2, 0.4], status: 'sourced', evidence: 'SRC' },
        { id: 'yield_age6', start: 1, unit: 'fraction', bounds: [1, 1], status: 'sourced', evidence: 'SRC' },
        { id: 'yield_cv', start: 0.2, unit: 'fraction', bounds: [0.1, 0.4], status: 'sourced', evidence: 'SRC' },
        { id: 'n_removal', start: 0.05, unit: 'kg/kg', bounds: [0.04, 0.06], status: 'sourced', evidence: 'SRC' },
        { id: 'n_growth', start: 10, unit: 'kg/ha', bounds: [0, 30], status: 'sourced', evidence: 'SRC' },
        { id: 'n_share_flowering', start: 0.4, unit: 'fraction', bounds: [0.4, 0.4], status: 'sourced', evidence: 'SRC' },
        { id: 'n_share_growing', start: 0.6, unit: 'fraction', bounds: [0.6, 0.6], status: 'sourced', evidence: 'SRC' },
        { id: 'k_removal', start: 0.06, unit: 'kg/kg', bounds: [0.05, 0.07], status: 'sourced', evidence: 'SRC' },
        { id: 'fert_efficiency', start: 0.8, unit: 'fraction', bounds: [0.5, 0.9], status: 'sourced', evidence: 'SRC' },
        { id: 'max_dose', start: 25, unit: 'kg/ha', bounds: [25, 25], status: 'sourced', evidence: 'SRC' },
        { id: 'sal_threshold', start: 1.5, unit: 'dS/m', bounds: [1.5, 1.5], status: 'sourced', evidence: 'SRC' },
        { id: 'sal_slope', start: 19, unit: '% per dS/m', bounds: [19, 19], status: 'sourced', evidence: 'SRC' },
        { id: 'leaching_max', start: 0.25, unit: 'fraction', bounds: [0.1, 0.3], status: 'sourced', evidence: 'SRC' },
        { id: 'p', start: 0.5, unit: 'fraction', bounds: [0.3, 0.7], status: 'sourced', evidence: 'SRC' },
        { id: 'root_depth_m', start: 1, unit: 'm', bounds: [0.5, 2], status: 'sourced', evidence: 'SRC' },
        { id: 'kcb_resting', start: 0.15, unit: 'dimensionless', bounds: [0.1, 0.3], status: 'sourced', evidence: 'SRC' },
        { id: 'kcb_growing', start: 0.9, unit: 'dimensionless', bounds: [0.7, 1.1], status: 'sourced', evidence: 'SRC' },
        { id: 'rain_defer', start: 0.7, unit: 'probability', bounds: [0.5, 0.9], status: 'sourced', evidence: 'SRC' },
        { id: 'deficit_floor', start: -15, unit: 'bar', bounds: [-20, -10], status: 'sourced', evidence: 'SRC' },
        { id: 'deficit_fraction', start: 0.5, unit: 'fraction', bounds: [0.4, 0.7], status: 'sourced', evidence: 'SRC' },
        { id: 'frost_flower_c', start: -2, unit: 'degC', bounds: [-2, -2], status: 'sourced', evidence: 'SRC' },
        { id: 'frost_hardy_10_c', start: -3, unit: 'degC', bounds: [-3, -3], status: 'sourced', evidence: 'SRC' },
        { id: 'frost_hardy_90_c', start: -5, unit: 'degC', bounds: [-5, -5], status: 'sourced', evidence: 'SRC' },
      ],
    },
    evidence: { evidence: { SRC: 'A source.' } },
    tests: [
      { id: 't0', kind: 'table', table: 'irrigation', state: { phase: 'resting' }, expect: { row: 'D-0' } },
    ],
  }
}

export function demoContext(change?: (raw: ReturnType<typeof demoPackRaw>) => void, overrides: Record<string, number> = {}): PackContext {
  const raw = demoPackRaw()
  change?.(raw)
  return createPackContext(packSchema.parse(raw), overrides)
}
