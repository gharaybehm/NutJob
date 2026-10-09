/**
 * Calls the model for the narration of a farm plan (CDSS spec §A9), with the
 * checks the specification requires around it:
 *
 *   R9.1  an answer containing a number that was not in the input is rejected
 *         and asked for again, once, on the stronger model
 *   R9.2  when the model fails or is rejected twice, the plan is shown with
 *         rule-based text; the engine never depends on the model to function
 *   R9.4  the narration is written in the language asked for
 *
 * Server-side only. The model receives what the engines computed: no farm
 * notes, no free text from users.
 */

import { checkNarration, languageInstruction, NARRATOR_SYSTEM_PROMPT, ruleBasedNarration, type Narration, type NarrationLanguage, type NarratorInput } from '@/engines/narrator/narration'
import { FALLBACK_MODEL, PRIMARY_MODEL, RETRY_MODEL } from '@/utils/ai-models'
import { completeWithFallback, isOpenRouterConfigured } from '@/utils/openrouter'

export interface NarrationResult {
  narration: Narration
  /** 'model' when the model's answer passed the check; 'rules' otherwise. */
  source: 'model' | 'rules'
  model: string | null
  language: NarrationLanguage
  /** Why each rejected attempt was rejected. */
  rejected: string[]
}

/** One model attempt: the parsed answer, or the reason it cannot be used. */
export type NarratorCall = (input: NarratorInput, language: NarrationLanguage, model: string) => Promise<{ output: unknown; model: string }>

const callModel: NarratorCall = async (input, language, model) => {
  const { completion, model: used } = await completeWithFallback(
    {
      messages: [
        { role: 'system', content: `${NARRATOR_SYSTEM_PROMPT}\n\n${languageInstruction(language)}` },
        { role: 'user', content: JSON.stringify(input) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    },
    model,
    FALLBACK_MODEL,
  )
  const text = completion.choices[0]?.message?.content ?? ''
  return { output: JSON.parse(text), model: used }
}

/** `call` is replaceable so the flow can be tested without a model. */
export async function narratePlan(input: NarratorInput, language: NarrationLanguage, useModel: boolean, call: NarratorCall = callModel): Promise<NarrationResult> {
  const rules = (rejected: string[]): NarrationResult => ({ narration: ruleBasedNarration(input), source: 'rules', model: null, language: 'en', rejected })
  // Nothing to explain, or no model asked for: the rule-based text is the narration.
  if (!useModel || (input.plan.length === 0 && input.deferred.length === 0)) return rules([])
  if (call === callModel && !isOpenRouterConfigured()) return rules(['No model is configured'])

  const rejected: string[] = []
  for (const model of [PRIMARY_MODEL, RETRY_MODEL]) {
    try {
      const { output, model: used } = await call(input, language, model)
      const problems = checkNarration(output, input)
      if (problems.length === 0) return { narration: output as Narration, source: 'model', model: used, language, rejected }
      rejected.push(`${used}: ${problems.join('; ')}`)
    } catch (e) {
      rejected.push(`${model}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return rules(rejected)
}
