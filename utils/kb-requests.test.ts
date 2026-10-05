import { describe, expect, it } from 'vitest'
import type { KnowledgeDocument } from './kb-coverage'
import { cleanRequestInput, fetchFarmKnowledgeRequests, findRequest, gapFor, knowledgeGaps, requestKeys, type KnowledgeRequest } from './kb-requests'

const doc = (source_title: string, crop_type: string | null, variety_applicability: string[] | null): KnowledgeDocument =>
  ({ source_file: `${source_title}.pdf`, source_title, crop_type, variety_applicability })

const DOCS: KnowledgeDocument[] = [
  doc('MAPA pest guide', 'almond', ['all']),
  doc('Makako datasheet', 'almond', ['Makako']),
]

const request = (farm_id: string, crop_key: string, variety_key: string, extra: Partial<KnowledgeRequest> = {}): KnowledgeRequest => ({
  id: `${farm_id}-${crop_key}-${variety_key}`, farm_id, requested_by: 'u1', crop_type: crop_key, variety: variety_key || null,
  crop_key, variety_key, note: null, link: null, status: 'open', admin_note: null,
  created_at: '2026-10-05T10:00:00Z', updated_at: '2026-10-05T10:00:00Z', ...extra,
})

describe('gapFor', () => {
  it('is a crop gap when nothing is loaded for the crop, whatever the variety', () => {
    expect(gapFor('Apple', 'Gala', DOCS)).toBe('crop')
    expect(gapFor('Elma', null, DOCS)).toBe('crop')
  })

  it('is a variety gap when the crop has guides but none names the variety', () => {
    expect(gapFor('Almond', 'Guara', DOCS)).toBe('variety')
  })

  it('is no gap when the variety is covered, not set, or there is no crop', () => {
    expect(gapFor('Badem', 'Makako', DOCS)).toBeNull()
    expect(gapFor('Almond', 'Unknown', DOCS)).toBeNull()
    expect(gapFor('Almond', null, DOCS)).toBeNull()
    expect(gapFor('', 'Gala', DOCS)).toBeNull()
  })
})

describe('requestKeys and findRequest', () => {
  it('keys a crop gap by the crop alone, so every variety of it shares one request', () => {
    expect(requestKeys('Apples', 'Gala', 'crop')).toEqual({ cropKey: 'apple', varietyKey: '' })
    expect(requestKeys('Elma', 'Fuji', 'crop')).toEqual({ cropKey: 'apple', varietyKey: '' })
  })

  it('keys a variety gap by crop and variety, ignoring spelling', () => {
    expect(requestKeys('Badem', 'Guara®', 'variety')).toEqual({ cropKey: 'almond', varietyKey: 'guara' })
  })

  it('has no keys when there is no gap', () => {
    expect(requestKeys('Almond', 'Makako', null)).toBeNull()
  })

  it('finds the farm\'s request for a gap', () => {
    const requests = [request('f1', 'apple', ''), request('f1', 'almond', 'guara')]
    expect(findRequest(requests, 'Elma', 'Fuji', 'crop')?.crop_key).toBe('apple')
    expect(findRequest(requests, 'Almond', 'Guara', 'variety')?.variety_key).toBe('guara')
    expect(findRequest(requests, 'Almond', 'Lauranne', 'variety')).toBeNull()
  })
})

describe('cleanRequestInput', () => {
  it('trims, and turns empty text into null', () => {
    expect(cleanRequestInput('  from the nursery  ', '  ')).toEqual({ note: 'from the nursery', link: null })
    expect(cleanRequestInput('', null)).toEqual({ note: null, link: null })
  })

  it('accepts a web address and nothing else', () => {
    expect(cleanRequestInput(null, 'https://example.org/guide.pdf').link).toBe('https://example.org/guide.pdf')
    expect(cleanRequestInput(null, 'example.org/guide.pdf').error).toBeTruthy()
    expect(cleanRequestInput(null, 'javascript:alert(1)').error).toBeTruthy()
    expect(cleanRequestInput(null, `https://example.org/${'a'.repeat(600)}`).error).toBeTruthy()
  })

  it('cuts a very long note', () => {
    expect(cleanRequestInput('x'.repeat(5000), null).note).toHaveLength(1000)
  })
})

describe('knowledgeGaps', () => {
  const farms = new Map([['f1', 'North Farm'], ['f2', 'South Farm']])
  const blocks = [
    { farm_id: 'f1', crop_type: 'Almond', variety: 'Makako' },
    { farm_id: 'f1', crop_type: 'Almond', variety: 'Guara' },
    { farm_id: 'f2', crop_type: 'Badem', variety: 'guara' },
    { farm_id: 'f2', crop_type: 'Badem', variety: 'Guara' },
    { farm_id: 'f1', crop_type: 'Apple', variety: 'Gala' },
    { farm_id: 'f2', crop_type: 'Elma', variety: 'Fuji' },
    { farm_id: 'f2', crop_type: null, variety: null },
  ]

  it('lists each gap once across farms, and leaves out what is covered', () => {
    const out = knowledgeGaps(blocks, farms, DOCS, [])
    expect(out.map(g => [g.crop, g.variety, g.kind, g.blocks, g.farms])).toEqual([
      ['Almond', 'Guara', 'variety', 3, ['North Farm', 'South Farm']],
      ['Apple', null, 'crop', 2, ['North Farm', 'South Farm']],
    ])
  })

  it('says when a crop needs engine data as well as guides', () => {
    const out = knowledgeGaps(blocks, farms, DOCS, [])
    expect(out.find(g => g.cropKey === 'apple')?.needsCropData).toBe(true)
    expect(out.find(g => g.cropKey === 'almond')?.needsCropData).toBe(false)
  })

  it('puts requested gaps first and attaches the requests with the farm name', () => {
    const out = knowledgeGaps(blocks, farms, DOCS, [request('f2', 'apple', '', { note: 'planting in spring' })])
    expect(out[0].cropKey).toBe('apple')
    expect(out[0].requests).toHaveLength(1)
    expect(out[0].requests[0]).toMatchObject({ farmName: 'South Farm', note: 'planting in spring' })
    expect(out[1].requests).toEqual([])
  })

  it('drops a request whose gap is gone', () => {
    const out = knowledgeGaps(blocks, farms, DOCS, [request('f1', 'almond', 'makako')])
    expect(out.flatMap(g => g.requests)).toEqual([])
  })
})

describe('fetchFarmKnowledgeRequests', () => {
  const client = (result: { data: unknown; error: unknown }) => ({ from: () => ({ select: () => ({ eq: async () => result }) }) })

  it('returns the rows', async () => {
    const rows = [request('f1', 'apple', '')]
    expect(await fetchFarmKnowledgeRequests(client({ data: rows, error: null }), 'f1')).toEqual(rows)
  })

  it('returns null, not an empty list, when the requests cannot be read', async () => {
    expect(await fetchFarmKnowledgeRequests(client({ data: null, error: { message: 'relation does not exist' } }), 'f1')).toBeNull()
  })
})
