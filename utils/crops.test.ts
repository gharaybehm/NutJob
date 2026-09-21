import { describe, expect, it } from 'vitest'
import { cropSupports, findCrop, knowledgeBaseCrop, rootstocksFor, varietiesFor } from './crops'

describe('findCrop', () => {
  it('finds a crop by its name in any language, ignoring case and accents', () => {
    for (const name of ['Almond', 'almond', 'ALMONDS', 'Badem', 'Almendro', 'Amande', 'Prunus dulcis']) {
      expect(findCrop(name)?.id, name).toBe('almond')
    }
  })

  it('returns null for a crop with no profile, and for nothing', () => {
    expect(findCrop('Pistachio')).toBeNull()
    expect(findCrop('Clementine')).toBeNull()
    expect(findCrop('')).toBeNull()
    expect(findCrop(null)).toBeNull()
  })
})

describe('cropSupports', () => {
  it('is true only for data a profile really has', () => {
    expect(cropSupports('Almond', 'frost')).toBe(true)
    expect(cropSupports('Almond', 'treeAge')).toBe(true)
    expect(cropSupports('Pistachio', 'frost')).toBe(false)
    expect(cropSupports(null, 'cropCoefficients')).toBe(false)
  })
})

describe('knowledgeBaseCrop', () => {
  it('sends every name of a profiled crop to its documents, and other crops to their own name', () => {
    expect(knowledgeBaseCrop('Badem')).toBe('almond')
    expect(knowledgeBaseCrop('Almendro')).toBe('almond')
    expect(knowledgeBaseCrop('Pistachio')).toBe('pistachio')
    expect(knowledgeBaseCrop('  Sweet Cherry ')).toBe('sweet cherry')
    expect(knowledgeBaseCrop('')).toBeNull()
  })
})

describe('suggestions', () => {
  it('lists Spanish and California almond varieties, and the two this farm grows', () => {
    expect(varietiesFor('Almond')).toEqual(expect.arrayContaining(['Vairo', 'Makako', 'Nonpareil']))
    expect(varietiesFor('badem')).toEqual(varietiesFor('almond'))
  })

  it('still suggests varieties for crops that have no profile, and none for an unknown crop', () => {
    expect(varietiesFor('Pistachio')).toContain('Kerman')
    expect(varietiesFor('Sweet Cherry')).toContain('Bing')
    expect(varietiesFor('Dragon fruit')).toEqual([])
  })

  it('puts a crop\'s own rootstocks first, then the general ones', () => {
    const almond = rootstocksFor('almond')
    expect(almond.slice(0, 3)).toEqual(['GF 677', 'Garnem', 'Monegro'])
    expect(almond).toContain('Nemaguard')
    expect(rootstocksFor('Pistachio')).toEqual(expect.arrayContaining(['Nemaguard', 'Titan']))
    expect(rootstocksFor('Pistachio')).not.toContain('GF 677')
  })
})
