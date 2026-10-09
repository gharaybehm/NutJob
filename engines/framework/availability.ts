/**
 * Whether an engine can run for a crop (CDSS spec §A1, R1.3): engines
 * discover what a crop needs from its pack. When the pack has no content
 * for an engine, the engine is inactive for those blocks and says so. It
 * does not fail.
 */

import type { Pack } from '../pack/schema'
import type { DecisionEngine } from './types'

export type EngineAvailability =
  | { active: true }
  | { active: false; missing: string[]; reason: string }

function hasContent(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

/** Looks up a dotted path such as `water.decision_table` in a pack. */
export function packSection(pack: Pack, path: string): unknown {
  let current: unknown = pack
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

export function engineAvailability(engine: Pick<DecisionEngine, 'engineId' | 'packRequirements'>, pack: Pack): EngineAvailability {
  const missing = engine.packRequirements().filter(path => !hasContent(packSection(pack, path)))
  if (missing.length === 0) return { active: true }
  return {
    active: false,
    missing,
    reason: `Pack ${pack.manifest.id} ${pack.manifest.version} has no ${missing.join(', ')}, so the ${engine.engineId} engine is inactive for this crop`,
  }
}
