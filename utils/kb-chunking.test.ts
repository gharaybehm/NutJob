import { describe, expect, it } from 'vitest'
import { chunkPages, isHeading } from './kb-chunking'

describe('isHeading', () => {
  it('recognises English, Spanish and dotted headings', () => {
    expect(isHeading('Chapter 7: Irrigation Management')).toBe(true)
    expect(isHeading('Capítulo 3 Plagas del almendro')).toBe(true)
    expect(isHeading('3.1. Monilinia laxa')).toBe(true)
    expect(isHeading('2. Ácaros y pulgones')).toBe(true)
  })

  it('rejects sentences and table-like lines', () => {
    expect(isHeading('4. Record your results (example form available online).')).toBe(false)
    expect(isHeading('10 adultos por trampa')).toBe(false)
    expect(isHeading('El almendro florece en marzo.')).toBe(false)
  })
})

describe('chunkPages', () => {
  it('records the starting page and heading of each chunk', () => {
    const pages = ['1. Introducción\ntexto uno', 'texto dos\n2. Plagas\ntexto tres']
    const chunks = chunkPages(pages, 1000, 100)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toMatchObject({ heading: '1. Introducción', page: 1 })
    expect(chunks[1]).toMatchObject({ heading: '2. Plagas', page: 2 })
    expect(chunks[0].content).toBe('texto uno texto dos')
    expect(chunks[1].content).toBe('texto tres')
  })

  it('splits long text into overlapping chunks and tracks pages', () => {
    const word = 'palabra '
    const pages = [word.repeat(300), word.repeat(300)] // ~2400 chars each
    const chunks = chunkPages(pages, 1000, 200)
    expect(chunks.length).toBeGreaterThan(3)
    expect(chunks[0].page).toBe(1)
    expect(chunks[chunks.length - 1].page).toBe(2)
    expect(chunks.every(c => c.content.length <= 1000)).toBe(true)
  })

  it('does not treat numbered lines as headings when detection is off', () => {
    const chunks = chunkPages(['1.   Adulto de mosquito verde en hoja\ntexto'], 1000, 100, false)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].heading).toBeNull()
    expect(chunks[0].content).toContain('Adulto de mosquito verde')
  })

  it('returns nothing for empty pages', () => {
    expect(chunkPages(['', '  \n '])).toEqual([])
  })
})
