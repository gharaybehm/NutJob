import { describe, expect, it } from 'vitest'
import { coverageFor, fetchKnowledgeDocuments, knowledgeCoverage, varietyScope, type KnowledgeDocument } from './kb-coverage'

const doc = (source_title: string, crop_type: string | null, variety_applicability: string[] | null): KnowledgeDocument =>
  ({ source_file: `${source_title}.pdf`, source_title, crop_type, variety_applicability })

const DOCS: KnowledgeDocument[] = [
  doc('MAPA pest guide', 'almond', ['all']),
  doc('Frost paper', 'almond', ['Vairo', 'all']),
  doc('Makako datasheet', 'almond', ['Makako']),
  doc('IRTA brochure', 'almond', ['Vairo', 'Constantí', 'Marinada', 'Tarraco']),
  doc('Untagged manual', 'almond', null),
  doc('Soil sampling basics', null, null),
]

describe('varietyScope', () => {
  it('is specific when the document names the variety, whatever the spelling', () => {
    expect(varietyScope(['Makako'], 'makako')).toBe('specific')
    expect(varietyScope(['Vairo', 'all'], 'Vairo®')).toBe('specific')
    expect(varietyScope(['Constantí'], 'Constanti')).toBe('specific')
  })

  it('is general for a whole-crop document, tagged "all" or not tagged', () => {
    expect(varietyScope(['all'], 'Vairo')).toBe('general')
    expect(varietyScope(null, 'Vairo')).toBe('general')
    expect(varietyScope([], 'Vairo')).toBe('general')
    expect(varietyScope(['Vairo', 'all'], 'Makako')).toBe('general')
  })

  it('is other for a document about different varieties only', () => {
    expect(varietyScope(['Makako'], 'Vairo')).toBe('other')
    expect(varietyScope(['Makako'], null)).toBe('other')
    expect(varietyScope(['Makako'], 'Unknown')).toBe('other')
  })
})

describe('coverageFor', () => {
  it('counts the crop\'s documents under any of the crop\'s names, and not crop-agnostic ones', () => {
    expect(coverageFor('Badem', 'Vairo', DOCS).cropDocuments).toHaveLength(5)
    expect(coverageFor('Almond', null, DOCS).cropDocuments).not.toContain('Soil sampling basics')
  })

  it('lists the documents that name the variety', () => {
    expect(coverageFor('Almond', 'Vairo', DOCS).varietyDocuments).toEqual(['Frost paper', 'IRTA brochure'])
    expect(coverageFor('Almond', 'Makako', DOCS).varietyDocuments).toEqual(['Makako datasheet'])
    expect(coverageFor('Almond', 'Nonpareil', DOCS).varietyDocuments).toEqual([])
  })

  it('finds nothing for a crop with no documents or no name', () => {
    expect(coverageFor('Apple', 'Gala', DOCS)).toEqual({ cropDocuments: [], varietyDocuments: [] })
    expect(coverageFor(null, null, DOCS).cropDocuments).toEqual([])
  })
})

describe('knowledgeCoverage', () => {
  const blocks = [
    { crop_type: 'Almond', variety: 'Vairo' },
    { crop_type: 'almond', variety: 'vairo' },
    { crop_type: 'Badem', variety: 'Nonpareil' },
    { crop_type: 'Almond', variety: 'Unknown' },
    { crop_type: 'Apple', variety: 'Gala' },
    { crop_type: 'Elma', variety: null },
  ]

  it('groups blocks by crop under any name, crops with no documents first', () => {
    const out = knowledgeCoverage(blocks, DOCS)
    expect(out.map(c => [c.crop, c.blocks, c.documents.length])).toEqual([['Apple', 2, 0], ['Almond', 4, 5]])
  })

  it('groups varieties ignoring spelling and leaves out placeholders', () => {
    const almond = knowledgeCoverage(blocks, DOCS).find(c => c.crop === 'Almond')!
    expect(almond.varieties).toEqual([
      { variety: 'Vairo', blocks: 2, documents: ['Frost paper', 'IRTA brochure'] },
      { variety: 'Nonpareil', blocks: 1, documents: [] },
    ])
  })

  it('reports blocks with no crop as their own group with no documents', () => {
    expect(knowledgeCoverage([{ crop_type: null, variety: null }], DOCS)).toEqual([{ crop: '', blocks: 1, documents: [], varieties: [] }])
  })
})

describe('fetchKnowledgeDocuments', () => {
  const client = (result: { data: unknown; error: unknown }) => ({ from: () => ({ select: async () => result }) })

  it('returns the rows', async () => {
    expect(await fetchKnowledgeDocuments(client({ data: DOCS, error: null }))).toEqual(DOCS)
  })

  it('returns null, not an empty list, when the documents cannot be read', async () => {
    expect(await fetchKnowledgeDocuments(client({ data: null, error: { message: 'relation does not exist' } }))).toBeNull()
  })
})
