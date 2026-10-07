import { describe, expect, it } from 'vitest'
import { cropsNamedIn } from './question-crop'

const FARM = ['almond', 'apple']

describe('cropsNamedIn', () => {
  it('finds a farm crop named in English, Turkish, Spanish or Arabic', () => {
    expect(cropsNamedIn('How do I monitor navel orangeworm in the almond blocks?', FARM)).toEqual(['almond'])
    expect(cropsNamedIn('Bademlerde kırmızı örümcek nasıl izlenir?', FARM)).toEqual(['almond'])
    expect(cropsNamedIn('¿Cuándo podar el almendro?', FARM)).toEqual(['almond'])
    expect(cropsNamedIn('كيف أراقب العنكبوت الأحمر في أشجار اللوز؟', FARM)).toEqual(['almond'])
    expect(cropsNamedIn('Elmalarda karaleke belirtileri nelerdir?', FARM)).toEqual(['apple'])
  })

  it('finds nothing when no farm crop is named, or a crop the farm does not grow', () => {
    expect(cropsNamedIn('How do I monitor mites?', FARM)).toEqual([])
    expect(cropsNamedIn('When should I prune pistachios?', FARM)).toEqual([])
  })

  it('finds both when both are named', () => {
    expect(cropsNamedIn('Compare frost risk for almonds and apples', FARM).sort()).toEqual(['almond', 'apple'])
  })
})
