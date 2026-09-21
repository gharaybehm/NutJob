import { describe, expect, it } from 'vitest'
import { isKnownOption, mergeOptions, optionKey, usedValues } from './plant-catalog'
import { varietiesFor, rootstocksFor } from './crops'

const ALMOND_VARIETIES = varietiesFor('almond')
const ROOTSTOCKS = rootstocksFor('almond')

describe('optionKey', () => {
  it('treats trademark signs, brackets, case and accents as the same name', () => {
    expect(optionKey('Vairo®')).toBe('vairo')
    expect(optionKey('  VAIRO (IRTA) ')).toBe('vairo')
    expect(optionKey('Ferragnès')).toBe(optionKey('ferragnes'))
    expect(optionKey('Constantí')).toBe('constanti')
    expect(optionKey('GF-677')).toBe('gf 677')
  })

  it('is empty for nothing', () => {
    expect(optionKey(null)).toBe('')
    expect(optionKey('  ')).toBe('')
  })
})

describe('catalog lists', () => {
  it('offers the two varieties this farm grows and the Spanish cultivars, not only California ones', () => {
    expect(ALMOND_VARIETIES).toEqual(expect.arrayContaining(['Vairo', 'Makako', 'Guara', 'Marinada', 'Nonpareil']))
    expect(ROOTSTOCKS).toEqual(expect.arrayContaining(['GF 677', 'Garnem', 'Nemaguard']))
  })

  it('has no repeated names within a list', () => {
    for (const list of [ALMOND_VARIETIES, ROOTSTOCKS]) {
      expect(new Set(list.map(optionKey)).size).toBe(list.length)
    }
  })
})

describe('mergeOptions', () => {
  it('keeps the first list\'s order and drops repeats by normalised name', () => {
    expect(mergeOptions(['Vairo', 'Makako'], ['vairo®', 'Guara', 'Ferragnes'], ['Ferragnès'])).toEqual(['Vairo', 'Makako', 'Guara', 'Ferragnes'])
  })

  it('drops placeholders and empties', () => {
    expect(mergeOptions(['Unknown', '', '  ', 'Titan'], [null as unknown as string])).toEqual(['Titan'])
  })

  it('handles missing lists', () => {
    expect(mergeOptions(undefined, null, ['A'])).toEqual(['A'])
  })
})

describe('isKnownOption', () => {
  it('matches a typed name against a suggestion without caring about accents or case', () => {
    expect(isKnownOption('makako', ALMOND_VARIETIES)).toBe(true)
    expect(isKnownOption('Constanti', ALMOND_VARIETIES)).toBe(true)
    expect(isKnownOption('Nurlu', ALMOND_VARIETIES)).toBe(false)
    expect(isKnownOption('', ALMOND_VARIETIES)).toBe(false)
  })
})

describe('usedValues', () => {
  const blocks = [
    { cropType: 'Almond', variety: 'Nurlu', rootstock: 'GF 677' },
    { cropType: 'almond', variety: 'nurlu ', rootstock: 'Unknown' },
    { cropType: 'Almond', variety: 'Vairo', rootstock: 'Local seedling' },
    { cropType: 'Pistachio', variety: 'Kerman', rootstock: 'Local seedling' },
  ]

  it('lists what the farm already uses, most used first, without repeats', () => {
    expect(usedValues(blocks, 'variety', 'Almond')).toEqual(['Nurlu', 'Vairo'])
    expect(usedValues(blocks, 'rootstock')).toEqual(['Local seedling', 'GF 677'])
  })

  it('keeps a variety list to the same crop and ignores Unknown', () => {
    expect(usedValues(blocks, 'variety', 'Pistachio')).toEqual(['Kerman'])
    expect(usedValues(blocks, 'rootstock', 'Almond')).toEqual(['GF 677', 'Local seedling'])
  })
})
