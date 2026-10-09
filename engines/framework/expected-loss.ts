/**
 * Expected loss avoided: the common currency of every engine (CDSS spec
 * §A5.3), following the Economic Injury Level logic of Stern et al. (1959)
 * and Pedigo et al. (1986): act only when the projected loss avoided
 * exceeds the cost of acting.
 *
 * Risks that must never be traded against money (food safety, legal limits,
 * water quotas) are constraints for the arbitrator, not inputs here.
 */

export interface ExpectedLossInput {
  /** Expected yield for the block, in the pack's yield unit per hectare. */
  expectedYieldPerHa: number
  areaHa: number
  /** Price per yield unit, a farm setting. */
  price: number
  /** Fraction of the crop the pack's damage function says is lost with no action, 0-1. */
  damageFraction: number
  /** Fraction of that loss the action prevents, 0-1. */
  efficacy: number
}

const inUnitRange = (v: number) => v >= 0 && v <= 1

/** Projected loss with no action (money). */
export function projectedLoss(input: Omit<ExpectedLossInput, 'efficacy'>): number {
  if (!inUnitRange(input.damageFraction)) throw new Error('damageFraction must be between 0 and 1')
  return input.expectedYieldPerHa * input.areaHa * input.price * input.damageFraction
}

/** expected loss avoided = projected loss if no action x efficacy of the action. */
export function expectedLossAvoided(input: ExpectedLossInput): number {
  if (!inUnitRange(input.efficacy)) throw new Error('efficacy must be between 0 and 1')
  return projectedLoss(input) * input.efficacy
}

export type ActionVerdict = 'act' | 'monitor'

/**
 * An action whose expected loss avoided does not exceed its cost is
 * downgraded to "monitor" and is not sent to the arbitrator. Mandatory
 * actions (safeguards, legal requirements) are never downgraded.
 */
export function actionVerdict(lossAvoided: number, cost: number, mandatory = false): ActionVerdict {
  if (mandatory) return 'act'
  return lossAvoided > cost ? 'act' : 'monitor'
}
