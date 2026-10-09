import { describe, expect, it, vi } from 'vitest'
import type { Narration, NarratorInput } from '@/engines/narrator/narration'
import { narratePlan, type NarratorCall } from './narrate'

const input: NarratorInput = {
  plan: [{ action_id: 'A1', block_id: 'B1', date: '2026-05-10', engine_id: 'irrigation', rule_id: 'D-3', action_type: 'irrigate', description: 'Apply 22.5 mm', quantity: 22.5, unit: 'mm', mandatory: false, confidence: 0.8, key_inputs: { Dr: 60, RAW: 50 }, evidence: 'SRC', expected_outcome: null }],
  deferred: [],
  state_summary: { B1: { phase: 'growing' } },
  flags: ['WEATHER_MODELLED'],
  safeguard_events: [],
}

const answer = (text: string): Narration => ({
  action_explanations: [{ action_id: 'A1', text }],
  deferred_explanations: [],
  conflicts: [],
  observation_requests: [],
  task_drafts: [{ action_id: 'A1', text: 'Apply 22.5 mm.' }],
})

describe('narratePlan', () => {
  it('uses the rule-based text and calls no model unless a model is asked for', async () => {
    const call = vi.fn()
    const r = await narratePlan(input, 'en', false, call)
    expect(call).not.toHaveBeenCalled()
    expect(r).toMatchObject({ source: 'rules', model: null })
    expect(r.narration.action_explanations[0].text).toMatch(/^Apply 22\.5 mm\. Rule D-3/)
  })

  it('calls no model when there is nothing to explain', async () => {
    const call = vi.fn()
    await narratePlan({ ...input, plan: [] }, 'en', true, call)
    expect(call).not.toHaveBeenCalled()
  })

  it('keeps a model answer that passes the check, in the language asked for', async () => {
    const call: NarratorCall = vi.fn(async (_input, _language, model) => ({ output: answer('Derinlik 60 mm, eşik 50 mm: 22.5 mm sulayın.'), model }))
    const r = await narratePlan(input, 'tr', true, call)
    expect(r).toMatchObject({ source: 'model', language: 'tr', rejected: [] })
    expect(call).toHaveBeenCalledTimes(1)
    expect(vi.mocked(call).mock.calls[0][1]).toBe('tr')
  })

  it('rejects an answer with an invented number and asks once more on the stronger model', async () => {
    const call: NarratorCall = vi
      .fn()
      .mockResolvedValueOnce({ output: answer('Apply about 25 mm.'), model: 'first' })
      .mockResolvedValueOnce({ output: answer('Depletion 60 mm reached 50 mm.'), model: 'second' })
    const r = await narratePlan(input, 'en', true, call)
    expect(call).toHaveBeenCalledTimes(2)
    expect(vi.mocked(call).mock.calls.map(c => c[2])).toEqual(['google/gemini-2.5-flash', 'google/gemini-2.5-pro'])
    expect(r).toMatchObject({ source: 'model', model: 'second' })
    expect(r.rejected).toEqual(['first: Contains number(s) that are not in the input: 25'])
  })

  it('falls back to the rule-based text when both answers are rejected', async () => {
    const call: NarratorCall = vi.fn(async (_i, _l, model) => ({ output: answer('Apply 99 mm.'), model }))
    const r = await narratePlan(input, 'tr', true, call)
    expect(call).toHaveBeenCalledTimes(2)
    expect(r).toMatchObject({ source: 'rules', model: null, language: 'en' })
    expect(r.rejected).toHaveLength(2)
  })

  it('falls back to the rule-based text when the model fails', async () => {
    const call: NarratorCall = vi.fn(async () => {
      throw new Error('service unavailable')
    })
    const r = await narratePlan(input, 'en', true, call)
    expect(r.source).toBe('rules')
    expect(r.rejected[0]).toMatch(/service unavailable/)
  })
})
