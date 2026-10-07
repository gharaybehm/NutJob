import { describe, expect, it } from 'vitest'
import type { RetrievedChunk } from '@/utils/generate-recommendations'
import {
  containsDose, hasRegulatorySourceFor, isPesticideProductOrDoseQuestion, labelPassages, mentionsPesticide, redactPesticideDoses,
} from './source-rules'

const chunk = (extra: Partial<RetrievedChunk> = {}): RetrievedChunk => ({
  content: 'text', source_title: 'Guide', source_section: null, similarity: 0.7, ...extra,
})

describe('isPesticideProductOrDoseQuestion', () => {
  it('catches product and dose questions in four languages', () => {
    expect(isPesticideProductOrDoseQuestion('What insecticide dose for peach twig borer?')).toBe(true)
    expect(isPesticideProductOrDoseQuestion('Which product should I spray for mites?')).toBe(true)
    expect(isPesticideProductOrDoseQuestion('Badem güvesi için hangi ilaç, dekara ne kadar?')).toBe(true)
    expect(isPesticideProductOrDoseQuestion('¿Qué dosis de fungicida para la mancha ocre?')).toBe(true)
    expect(isPesticideProductOrDoseQuestion('ما هي جرعة المبيد لحشرة المن؟')).toBe(true)
  })

  it('leaves alone questions that ask neither for a product nor a dose', () => {
    expect(isPesticideProductOrDoseQuestion('When was block 3 last irrigated?')).toBe(false)
    expect(isPesticideProductOrDoseQuestion('How do I scout for navel orangeworm?')).toBe(false)
    expect(isPesticideProductOrDoseQuestion('What nitrogen rate does the budget give for block 2?')).toBe(false)
  })

  it('does not read "rate" inside another word', () => {
    expect(mentionsPesticide('irrigate the block')).toBe(false)
    expect(isPesticideProductOrDoseQuestion('Should I irrigate before the fungicide window?')).toBe(false)
  })
})

describe('hasRegulatorySourceFor', () => {
  it('needs a regulatory passage from the farm country', () => {
    expect(hasRegulatorySourceFor([chunk({ regulatory: true, country: 'ES' })], 'TR')).toBe(false)
    expect(hasRegulatorySourceFor([chunk({ regulatory: false, country: 'TR' })], 'TR')).toBe(false)
    expect(hasRegulatorySourceFor([chunk({ regulatory: true, country: 'tr' })], 'TR')).toBe(true)
  })

  it('is false when the farm has no country', () => {
    expect(hasRegulatorySourceFor([chunk({ regulatory: true, country: 'TR' })], null)).toBe(false)
  })
})

describe('containsDose', () => {
  it('finds rates in common forms', () => {
    expect(containsDose('Apply 250 ml/100 L of water.')).toBe(true)
    expect(containsDose('Use 1.5 L per ha.')).toBe(true)
    expect(containsDose('40 cc/da yeterlidir')).toBe(true)
    expect(containsDose('dekara 50 ml uygulayın')).toBe(true)
    expect(containsDose('استخدم 200 مل لكل لتر')).toBe(true)
  })

  it('ignores figures that are not rates', () => {
    expect(containsDose('Block 2 needs 18 mm of irrigation.')).toBe(false)
    expect(containsDose('Frost risk below -2 °C on 12 March.')).toBe(false)
  })
})

describe('redactPesticideDoses', () => {
  it('removes dose sentences when the question is about pesticides', () => {
    const r = redactPesticideDoses('Mites are present. Spray abamectin at 50 ml/100 L. Check again in a week.', 'What should I spray for mites?')
    expect(r.redacted).toBe(true)
    expect(r.text).toBe('Mites are present. Check again in a week.')
  })

  it('keeps a fertiliser rate in a fertiliser answer', () => {
    const answer = 'The budget gives 120 kg/ha of nitrogen this season.'
    expect(redactPesticideDoses(answer, 'How much nitrogen is left?')).toEqual({ text: answer, redacted: false })
  })

  it('removes a pesticide dose the model volunteered in an unrelated answer', () => {
    const r = redactPesticideDoses('Irrigate tomorrow. A fungicide at 2 L/ha would also help.', 'Should I irrigate?')
    expect(r).toEqual({ text: 'Irrigate tomorrow.', redacted: true })
  })
})

describe('labelPassages', () => {
  it('says when a source is from another country, and that its regulation does not apply', () => {
    const [p] = labelPassages([chunk({ country: 'ES', regulatory: true })], 'TR')
    expect(p.local).toBe(false)
    expect(p.origin).toContain("from ES, not the farm's country (TR)")
    expect(p.origin).toContain('regulatory source in ES only')
  })

  it('numbers passages from 1 and marks local ones', () => {
    const ps = labelPassages([chunk({ country: 'TR' }), chunk({ country: 'US' })], 'TR')
    expect(ps.map((p) => [p.n, p.local])).toEqual([[1, true], [2, false]])
  })
})
