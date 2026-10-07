import { describe, expect, it } from 'vitest'
import type { DailySnapshot } from '@/engines/snapshot'
import type { RetrievedChunk } from '@/utils/generate-recommendations'
import { labelPassages } from './source-rules'
import { groupDrafts } from './draft-groups'
import { applyIrrigationCalculation, parseDrafts, splitDrafts, streamSafeLength, DRAFTS_MARKER, type DraftContext } from './drafts'

const BLOCKS = [{ id: 'blk-a', name: 'Block A' }, { id: 'blk-b', name: 'Block B' }]
const passages = labelPassages([{ content: 'x', source_title: 'UC IPM', source_section: 'Mites', similarity: 0.7 } as RetrievedChunk], 'TR')
const ctx: DraftContext = {
  blocks: BLOCKS, passages, answerReferenceStatus: 'found', question: 'What should I do about mites?', dosesAllowed: false,
  suppliedText: 'requirement 18 mm',
}
const t = (key: string, v: Record<string, string | number> = {}) => `${key}${Object.entries(v).map(([k, x]) => ` ${k}=${x}`).join('')}`

describe('splitDrafts and streamSafeLength', () => {
  it('separates the answer from the drafts block', () => {
    expect(splitDrafts(`Scout now [1].\n${DRAFTS_MARKER}\n[{"a":1}]`)).toEqual({ answer: 'Scout now [1].', raw: '\n[{"a":1}]' })
    expect(splitDrafts('No drafts here.')).toEqual({ answer: 'No drafts here.', raw: null })
  })

  it('never streams the marker or a tail that could start it', () => {
    expect(streamSafeLength(`Scout now.\n${DRAFTS_MARKER}[...]`)).toBe('Scout now.\n'.length)
    expect(streamSafeLength('Scout now.\n===DR')).toBe('Scout now.\n'.length)
    expect(streamSafeLength('Scout now.')).toBe('Scout now.'.length)
  })
})

describe('parseDrafts', () => {
  const raw = (o: object[]) => `\n${JSON.stringify(o)}`
  const good = { block: 'blk-a', category: 'scout', title: 'Scout Block A for mites', rationale: 'Mites are active in October [1].', confidence: 80, sources: [1] }

  it('keeps a valid draft and maps its citations to the passages', () => {
    const [d] = parseDrafts(raw([good]), ctx)
    expect(d).toMatchObject({ block_id: 'blk-a', block_name: 'Block A', category: 'scout', confidence: 80, reference_status: 'found', from_calculation: false })
    expect(d.sources).toEqual([{ n: 1, title: 'UC IPM', section: 'Mites' }])
  })

  it('accepts the block by name too', () => {
    expect(parseDrafts(raw([{ ...good, block: 'block b' }]), ctx)[0].block_id).toBe('blk-b')
  })

  it('drops a draft for another farm\'s block, an unknown category or empty text', () => {
    expect(parseDrafts(raw([{ ...good, block: 'other-farm-block' }]), ctx)).toEqual([])
    expect(parseDrafts(raw([{ ...good, category: 'harvest' }]), ctx)).toEqual([])
    expect(parseDrafts(raw([{ ...good, title: ' ' }]), ctx)).toEqual([])
  })

  it('drops a pesticide dose without a regulatory source, and a made-up figure', () => {
    expect(parseDrafts(raw([{ ...good, category: 'spray', rationale: 'Spray abamectin at 50 ml/100 L.' }]), ctx)).toEqual([])
    expect(parseDrafts(raw([{ ...good, rationale: 'Irrigate 25 mm tomorrow.' }]), ctx)).toEqual([])
  })

  it('ignores citations to passages that were not given, and marks the draft unsourced', () => {
    const [d] = parseDrafts(raw([{ ...good, sources: [7] }]), ctx)
    expect(d.sources).toEqual([])
    expect(d.reference_status).toBe('no_match')
  })

  it('groups the same action on several blocks into one card', () => {
    const drafts = parseDrafts(raw([good, { ...good, block: 'blk-b' }, { ...good, category: 'prune', title: 'Prune Block A' }]), ctx)
    expect(groupDrafts(drafts).map((g) => [g.indexes, g.drafts.map((d) => d.block_name)])).toEqual([
      [[0, 1], ['Block A', 'Block B']],
      [[2], ['Block A']],
    ])
  })

  it('keeps at most six drafts and survives broken JSON', () => {
    expect(parseDrafts(raw(Array(8).fill(good)), ctx)).toHaveLength(6)
    expect(parseDrafts('\n[{"block": "blk-a", ', ctx)).toEqual([])
    expect(parseDrafts('```json\n' + JSON.stringify([good]) + '\n```', ctx)).toHaveLength(1)
  })
})

describe('applyIrrigationCalculation', () => {
  const snap = (status: string) => ({
    date: '2026-10-07',
    crop: { hasProfile: true },
    water: { irrigation: { status, requirementMm: 18.5, requirementM3: 370, depletionMm: 40, rawMm: 48, daysToThreshold: 0, confidence: 'medium' } },
  }) as unknown as DailySnapshot
  const modelDraft = parseDrafts(`\n${JSON.stringify([{ block: 'blk-a', category: 'irrigate', title: 'Irrigate Block A', rationale: 'Soil is drying.', sources: [] }])}`, ctx)

  it('replaces the model\'s irrigation card with the calculation\'s template', () => {
    const [d] = applyIrrigationCalculation(modelDraft, BLOCKS, new Map([['blk-a', snap('irrigate_now')]]), t)
    expect(d.from_calculation).toBe(true)
    expect(d.title).toBe('templates.irrigate.titleNow block=Block A mm=18.5')
    expect(d.confidence).toBe(70)
  })

  it('drops an irrigation card the calculation contradicts', () => {
    expect(applyIrrigationCalculation(modelDraft, BLOCKS, new Map([['blk-a', snap('no_irrigation_needed')]]), t)).toEqual([])
  })

  it('keeps the model\'s card while the calculation is off', () => {
    expect(applyIrrigationCalculation(modelDraft, BLOCKS, new Map([['blk-a', snap('data_required')]]), t)).toEqual(modelDraft)
    expect(applyIrrigationCalculation(modelDraft, BLOCKS, new Map(), t)).toEqual(modelDraft)
  })
})
