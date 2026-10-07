/**
 * Requests for knowledge-base guides, and the platform admin's list of gaps.
 * Pure (the one fetch helper takes its client), so the rules are unit-testable.
 *
 * A gap is a crop with no documents, or a variety that no document names while
 * its crop has some. A farm's supervisor or admin can request guides for a gap;
 * the platform admin sees every gap on every farm, requested or not.
 */
import { findCrop, knowledgeBaseCrop } from './crops'
import { coverageFor, type KnowledgeDocument } from './kb-coverage'
import { isPlaceholder, optionKey } from './plant-catalog'

export type KnowledgeRequestStatus = 'open' | 'in_progress' | 'done' | 'declined'

/** A row of knowledge_requests. */
export interface KnowledgeRequest {
  id: string
  farm_id: string
  requested_by: string | null
  crop_type: string
  variety: string | null
  crop_key: string
  variety_key: string
  note: string | null
  link: string | null
  status: KnowledgeRequestStatus
  admin_note: string | null
  created_at: string
  updated_at: string
  /** 'gap' (one per farm per gap) or 'question' (from the assistant, closed by hand). Missing before the Phase 2 migration. */
  kind?: 'gap' | 'question'
  origin?: 'manual' | 'assistant'
  /** Questions from the assistant attached to a gap request. */
  questions?: string[]
  /** The question of a question-level request. */
  question?: string | null
}

/** A request about a gap (every request made before question-level requests existed). */
export function isGapRequest(r: Pick<KnowledgeRequest, 'kind'>): boolean {
  return (r.kind ?? 'gap') === 'gap'
}

/**
 * What is missing for a crop and variety:
 * - `crop`: nothing is loaded for the crop.
 * - `variety`: the crop has guides, but none names this variety.
 * - null: nothing is missing (or there is no crop to ask about).
 */
export type GapKind = 'crop' | 'variety' | null

export function gapFor(cropType: string | null | undefined, variety: string | null | undefined, docs: KnowledgeDocument[]): GapKind {
  if (!knowledgeBaseCrop(cropType)) return null
  const coverage = coverageFor(cropType, variety, docs)
  if (coverage.cropDocuments.length === 0) return 'crop'
  if (!isPlaceholder(variety) && coverage.varietyDocuments.length === 0) return 'variety'
  return null
}

/**
 * The keys a request is stored and matched under. A request for a crop with no
 * guides is about the whole crop even when the block has a variety, so two
 * blocks of the same uncovered crop share one request.
 */
export function requestKeys(cropType: string | null | undefined, variety: string | null | undefined, kind: GapKind): { cropKey: string; varietyKey: string } | null {
  const cropKey = knowledgeBaseCrop(cropType)
  if (!cropKey || !kind) return null
  return { cropKey, varietyKey: kind === 'variety' ? optionKey(variety) : '' }
}

/** The farm's request for this gap, if it made one. */
export function findRequest<T extends Pick<KnowledgeRequest, 'crop_key' | 'variety_key'>>(
  requests: T[],
  cropType: string | null | undefined,
  variety: string | null | undefined,
  kind: GapKind,
): T | null {
  const keys = requestKeys(cropType, variety, kind)
  if (!keys) return null
  return requests.find(r => r.crop_key === keys.cropKey && r.variety_key === keys.varietyKey) ?? null
}

const MAX_NOTE = 1000
const MAX_LINK = 500

/** Cleans what the user typed. Returns an error message for a link that is not a web address. */
export function cleanRequestInput(note: string | null | undefined, link: string | null | undefined): { note: string | null; link: string | null; error?: string } {
  const cleanNote = (note ?? '').trim().slice(0, MAX_NOTE) || null
  const rawLink = (link ?? '').trim()
  if (!rawLink) return { note: cleanNote, link: null }
  if (rawLink.length > MAX_LINK) return { note: cleanNote, link: null, error: 'The link is too long.' }
  let url: URL
  try {
    url = new URL(rawLink)
  } catch {
    return { note: cleanNote, link: null, error: 'The link must be a full web address starting with https://' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { note: cleanNote, link: null, error: 'The link must be a full web address starting with https://' }
  }
  return { note: cleanNote, link: url.toString() }
}

export interface GapRequest extends KnowledgeRequest {
  farmName: string
}

export interface KnowledgeGap {
  cropKey: string
  varietyKey: string
  /** The crop and variety as first typed on a block. */
  crop: string
  variety: string | null
  kind: 'crop' | 'variety'
  /** True when the crop has no profile, so engine data is missing too, not only guides. */
  needsCropData: boolean
  farms: string[]
  blocks: number
  requests: GapRequest[]
}

/**
 * Every gap on every farm, with the requests made for it. Gaps somebody asked
 * about come first, then the ones touching the most blocks.
 */
export function knowledgeGaps(
  blocks: { farm_id: string; crop_type?: string | null; variety?: string | null }[],
  farmNames: Map<string, string>,
  docs: KnowledgeDocument[],
  requests: KnowledgeRequest[],
): KnowledgeGap[] {
  const gaps = new Map<string, KnowledgeGap>()
  for (const b of blocks) {
    const kind = gapFor(b.crop_type, b.variety, docs)
    const keys = requestKeys(b.crop_type, b.variety, kind)
    if (!kind || !keys) continue
    const id = `${keys.cropKey}|${keys.varietyKey}`
    let gap = gaps.get(id)
    if (!gap) {
      gap = {
        cropKey: keys.cropKey,
        varietyKey: keys.varietyKey,
        crop: (b.crop_type ?? '').trim(),
        variety: kind === 'variety' ? (b.variety ?? '').trim() : null,
        kind,
        needsCropData: findCrop(b.crop_type) === null,
        farms: [],
        blocks: 0,
        requests: [],
      }
      gaps.set(id, gap)
    }
    gap.blocks += 1
    const farm = farmNames.get(b.farm_id) ?? 'Unknown farm'
    if (!gap.farms.includes(farm)) gap.farms.push(farm)
  }
  for (const r of requests) {
    if (!isGapRequest(r)) continue
    const gap = gaps.get(`${r.crop_key}|${r.variety_key}`)
    // No gap any more: the guides were loaded, or the blocks were changed or removed.
    if (gap) gap.requests.push({ ...r, farmName: farmNames.get(r.farm_id) ?? 'Unknown farm' })
  }
  return [...gaps.values()].sort((a, b) =>
    Number(b.requests.length > 0) - Number(a.requests.length > 0) || b.blocks - a.blocks || a.crop.localeCompare(b.crop))
}

interface RequestReader {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the table is not in the generated types
  from: (table: any) => any
}

/**
 * A farm's requests. Null when they cannot be read (the table's migration is not
 * applied yet, or the query failed), and then the request button is not offered.
 */
export async function fetchFarmKnowledgeRequests(client: RequestReader, farmId: string): Promise<KnowledgeRequest[] | null> {
  const { data, error } = await client.from('knowledge_requests').select('*').eq('farm_id', farmId)
  if (error || !data) return null
  // Question-level requests share the crop key with a crop gap's request; only gap requests answer "is this gap requested".
  return (data as KnowledgeRequest[]).filter(isGapRequest)
}
