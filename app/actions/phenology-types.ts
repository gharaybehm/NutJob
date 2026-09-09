/**
 * Phenology value + type exports.
 *
 * These live outside `phenology.ts` because a `"use server"` file may only
 * export async functions — Next validates every export at module evaluation
 * and throws (E352) on anything else, which takes down the whole route.
 */

export const PHENOLOGY_EVENT_TYPES = [
  'bud-break',
  'full-bloom',
  'petal-fall',
  'hull-split',
  'harvest-start',
  'harvest-end',
] as const;

export type PhenologyEventType = (typeof PHENOLOGY_EVENT_TYPES)[number];

export interface PhenologyEvent {
  id: string;
  block_id: string;
  event_type: PhenologyEventType;
  observed_on: string; // YYYY-MM-DD
  season: number;
  notes: string | null;
  created_at: string;
}
