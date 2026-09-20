import { describe, expect, it } from 'vitest'
import { expandQuery, selectChunks } from './kb-retrieval'

describe('expandQuery', () => {
  it('adds Spanish and Latin terms for a known English pest', () => {
    const q = expandQuery('almond flatheaded borer damage')
    expect(q.keywords).toContain('capnodis')
    expect(q.embeddingText).toContain('barrenador')
    expect(q.embeddingText.startsWith('almond flatheaded borer damage')).toBe(true)
  })

  it('finds pests from a Latin name alone', () => {
    expect(expandQuery('Monilinia laxa on flowers').keywords).toContain('monilinia')
  })

  it('combines several pests in one query', () => {
    const q = expandQuery('aphid and red leaf blotch')
    expect(q.keywords).toEqual(expect.arrayContaining(['pulgón', 'polystigma']))
  })

  it('leaves an unknown query unchanged and without keywords', () => {
    const q = expandQuery('general orchard management')
    expect(q.embeddingText).toBe('general orchard management')
    expect(q.keywords).toEqual([])
  })

  it('only ever returns letter-only keywords, safe for a text-search query', () => {
    const q = expandQuery("Monilinia'; DROP TABLE x; -- Capnodis")
    expect(q.keywords.every(k => /^[\p{L}]+$/u.test(k))).toBe(true)
  })
})

describe('selectChunks', () => {
  const c = (id: string, similarity: number, country: string, keyword_hit = false, rrf_score = similarity) =>
    ({ id, similarity, country, keyword_hit, rrf_score })

  it('drops weak matches unless a keyword matched', () => {
    const out = selectChunks([c('a', 0.62, 'US'), c('b', 0.3, 'ES', false), c('c', 0.3, 'ES', true)], 5, 0.5)
    expect(out.map(x => x.id).sort()).toEqual(['a', 'c'])
  })

  it('raises the bar for vector-only matches when the query named something specific', () => {
    const rows = [c('weak', 0.58, 'ES'), c('strong', 0.66, 'ES'), c('kw', 0.4, 'ES', true)]
    expect(selectChunks(rows, 5, 0.5, true).map(x => x.id).sort()).toEqual(['kw', 'strong'])
    expect(selectChunks(rows, 5, 0.5, false).map(x => x.id).sort()).toEqual(['kw', 'strong', 'weak'])
  })

  it('reserves a slot for each country so one source cannot crowd out another', () => {
    const rows = [c('us1', 0.9, 'US'), c('us2', 0.85, 'US'), c('us3', 0.8, 'US'), c('es1', 0.55, 'ES')]
    const out = selectChunks(rows, 3, 0.5)
    expect(out.map(x => x.id)).toContain('es1')
    expect(out).toHaveLength(3)
  })

  it('never returns more than k and keeps fused-score order', () => {
    const rows = [c('a', 0.9, 'US', false, 0.03), c('b', 0.8, 'US', false, 0.02), c('c', 0.7, 'ES', false, 0.01)]
    const out = selectChunks(rows, 2, 0.5)
    expect(out).toHaveLength(2)
    expect(out[0].id).toBe('a')
  })
})
