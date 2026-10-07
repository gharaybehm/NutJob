import { describe, expect, it } from 'vitest'
import { answerReferenceStatus, checkAnswer, citedNumbers, stripInvalidCitations, unknownFigures } from './answer-checks'

describe('citations', () => {
  it('lists distinct markers in order', () => {
    expect(citedNumbers('Scout weekly [2]. Traps help [1][2].')).toEqual([2, 1])
  })

  it('drops markers that point at no passage', () => {
    expect(stripInvalidCitations('Scout weekly [2]. Use traps [7].', 2)).toBe('Scout weekly [2]. Use traps.')
  })
})

describe('unknownFigures', () => {
  const supplied = 'Irrigation requirement: 18.5 mm. Frost LT10 -2.2 °C. Nitrogen budget 120 kg N/ha.'

  it('accepts figures that were supplied', () => {
    expect(unknownFigures('Apply 18.5 mm; frost damage starts near -2.2 °C.', supplied)).toEqual([])
    expect(unknownFigures('The budget is 120 kg/ha.', supplied)).toEqual([])
  })

  it('accepts the same value written with a comma', () => {
    expect(unknownFigures('Sulama ihtiyacı 18,5 mm.', supplied)).toEqual([])
  })

  it('flags a figure the model worked out', () => {
    expect(unknownFigures('Apply 25 mm tomorrow.', supplied)).toEqual(['25 mm'])
  })

  it('ignores numbers without a unit', () => {
    expect(unknownFigures('Block 7 on 12 March.', supplied)).toEqual([])
  })
})

describe('checkAnswer', () => {
  const base = { passageCount: 2, isAdvice: true, suppliedText: 'requirement 18 mm' }

  it('passes a cited answer with known figures', () => {
    expect(checkAnswer('Irrigate 18 mm [1].', base)).toEqual({ problems: [], cited: [1] })
  })

  it('wants a citation for advice when passages were given', () => {
    expect(checkAnswer('Irrigate soon.', base).problems).toEqual(['no_citation'])
  })

  it('does not want one for a record question or when nothing was given', () => {
    expect(checkAnswer('Last irrigated on 3 May.', { ...base, isAdvice: false }).problems).toEqual([])
    expect(checkAnswer('Irrigate soon.', { ...base, passageCount: 0 }).problems).toEqual([])
  })

  it('rejects output in the wrong form', () => {
    expect(checkAnswer('{"answer": "x"}', base).problems).toContain('form')
    expect(checkAnswer(' ', base).problems).toContain('form')
  })

  it('ignores an invalid marker as a citation', () => {
    expect(checkAnswer('Irrigate soon [5].', base)).toEqual({ problems: ['no_citation'], cited: [] })
  })
})

describe('answerReferenceStatus', () => {
  it('follows the recommendation reasons', () => {
    expect(answerReferenceStatus('found', 2)).toBe('found')
    expect(answerReferenceStatus('found', 0)).toBe('no_match')
    expect(answerReferenceStatus('none_loaded', 0)).toBe('none_loaded')
    expect(answerReferenceStatus('error', 0)).toBe('error')
    expect(answerReferenceStatus(null, 0)).toBeNull()
  })
})
