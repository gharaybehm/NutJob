/**
 * Maps the database growth stage (phenology_records.current_stage, hyphenated)
 * to the stage names the engines use. The two engines need different mappings
 * from the same stage: `nut-development` spans fruit set to hull fill, so it
 * uses the hull-fill crop coefficient but the fruitlet frost thresholds (the
 * conservative choice; a summer forecast never approaches those temperatures).
 */

export interface EngineStages {
  irrigation: string | null
  frost: string | null
  /** Shown to the manager when the stage cannot be assessed by an engine. */
  notes: string[]
}

export function toEngineStages(dbStage: string | null | undefined): EngineStages {
  switch (dbStage) {
    case 'dormancy':
      return { irrigation: 'dormant', frost: null, notes: [] }
    case 'bud-swell':
    case 'bud-break':
      return {
        irrigation: 'bloom',
        frost: null,
        notes: ['Buds are frost-sensitive before bloom, but no sourced thresholds are loaded for this stage, so frost is not assessed'],
      }
    case 'bloom':
      return { irrigation: 'bloom', frost: 'bloom', notes: [] }
    case 'petal-fall':
      return { irrigation: 'fruit_set', frost: 'fruit_set', notes: [] }
    case 'nut-development':
      return { irrigation: 'hull_fill', frost: 'fruit_set', notes: [] }
    case 'hull-split':
      return { irrigation: 'hull_split', frost: null, notes: [] }
    case 'harvest':
      return { irrigation: 'harvest', frost: null, notes: [] }
    case 'post-harvest':
      return { irrigation: 'post_harvest', frost: null, notes: [] }
    default:
      return { irrigation: null, frost: null, notes: [] }
  }
}
