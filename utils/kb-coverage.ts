/**
 * Knowledge-base coverage: which crops and varieties on a farm have documents
 * loaded, and which do not. Pure (the one fetch helper takes its client), so the
 * rules are unit-testable and shared by retrieval, Settings and the block panel.
 *
 * Why: a crop or variety with no documents still gets recommendations, written
 * from the model's own knowledge with no citation. Nothing showed that gap.
 */
import { knowledgeBaseCrop } from './crops'
import { isPlaceholder, optionKey } from './plant-catalog'

/** One ingested document (a row of the knowledge_base_documents view). */
export interface KnowledgeDocument {
  source_file: string | null
  source_title: string
  /** Null for crop-agnostic material, which every crop may use. */
  crop_type: string | null
  /** Varieties the document is about. Null, empty or containing "all" means the whole crop. */
  variety_applicability: string[] | null
}

/**
 * How a document relates to a block's variety:
 * - `specific`: it names this variety.
 * - `general`: it is about the whole crop.
 * - `other`: it is about other varieties only (a datasheet for a different cultivar).
 */
export type VarietyScope = 'specific' | 'general' | 'other'

export function varietyScope(applicability: string[] | null | undefined, variety: string | null | undefined): VarietyScope {
  const keys = (applicability ?? []).map(optionKey).filter(Boolean)
  const mine = isPlaceholder(variety) ? '' : optionKey(variety)
  if (mine && keys.includes(mine)) return 'specific'
  if (keys.length === 0 || keys.includes('all')) return 'general'
  return 'other'
}

/** Whether the document is stored under this crop, compared as the search function compares (lower case). */
function isForCrop(doc: KnowledgeDocument, kbCrop: string | null): boolean {
  return kbCrop !== null && doc.crop_type !== null && doc.crop_type.toLowerCase() === kbCrop
}

export interface BlockCoverage {
  /** Titles of the documents loaded for the block's crop (any variety scope). */
  cropDocuments: string[]
  /** Titles of the crop's documents that name the block's variety. */
  varietyDocuments: string[]
}

export function coverageFor(
  cropType: string | null | undefined,
  variety: string | null | undefined,
  docs: KnowledgeDocument[],
): BlockCoverage {
  const forCrop = docs.filter(d => isForCrop(d, knowledgeBaseCrop(cropType)))
  return {
    cropDocuments: forCrop.map(d => d.source_title),
    varietyDocuments: forCrop.filter(d => varietyScope(d.variety_applicability, variety) === 'specific').map(d => d.source_title),
  }
}

export interface VarietyCoverage {
  variety: string
  blocks: number
  documents: string[]
}

export interface CropCoverage {
  /** The crop as first typed on a block; empty when the blocks have no crop set. */
  crop: string
  blocks: number
  documents: string[]
  varieties: VarietyCoverage[]
}

/** Coverage per crop and variety grown on the farm, crops with no documents first. */
export function knowledgeCoverage(
  blocks: { crop_type?: string | null; variety?: string | null }[],
  docs: KnowledgeDocument[],
): CropCoverage[] {
  const crops = new Map<string, CropCoverage>()
  for (const b of blocks) {
    const cropKey = knowledgeBaseCrop(b.crop_type) ?? ''
    let crop = crops.get(cropKey)
    if (!crop) {
      crop = { crop: (b.crop_type ?? '').trim(), blocks: 0, documents: coverageFor(b.crop_type, null, docs).cropDocuments, varieties: [] }
      crops.set(cropKey, crop)
    }
    crop.blocks += 1
    if (isPlaceholder(b.variety)) continue
    const varietyKey = optionKey(b.variety)
    const known = crop.varieties.find(v => optionKey(v.variety) === varietyKey)
    if (known) known.blocks += 1
    else crop.varieties.push({ variety: (b.variety ?? '').trim(), blocks: 1, documents: coverageFor(b.crop_type, b.variety, docs).varietyDocuments })
  }
  return [...crops.values()].sort((a, b) => Number(a.documents.length > 0) - Number(b.documents.length > 0) || a.crop.localeCompare(b.crop))
}

interface DocumentReader {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the view is not in the generated types
  from: (table: any) => any
}

/**
 * The documents in the knowledge base, one row each. Null when they cannot be
 * read (the view's migration is not applied yet, or the query failed), so a
 * caller shows "unknown" and never "nothing loaded".
 */
export async function fetchKnowledgeDocuments(client: DocumentReader): Promise<KnowledgeDocument[] | null> {
  const { data, error } = await client
    .from('knowledge_base_documents')
    .select('source_file, source_title, crop_type, variety_applicability')
  if (error || !data) return null
  return data as KnowledgeDocument[]
}
