/**
 * Recurring-income detection.
 *
 * The next income deposit is the most important date in the product: it is the
 * boundary the projected low balance is measured against. FinAhead will not
 * guess it. A deposit stream must show a repeating cadence and a stable amount,
 * and if nothing qualifies the app says so and asks the user instead of
 * inventing a payday.
 *
 * A candidate must satisfy ALL of:
 *   - positive amounts (money arriving)
 *   - the same normalised merchant or description
 *   - at least MIN_OCCURRENCES deposits
 *   - every observed gap inside one cadence window (biweekly 12–16 days,
 *     monthly 25–35 days)
 *   - amount spread within MAX_AMOUNT_VARIATION_PCT
 */

import type {
  Cadence,
  NormalizedTransaction,
  PredictedEvent,
} from './types'
import {
  BIWEEKLY_MAX_INTERVAL_DAYS,
  BIWEEKLY_MIN_INTERVAL_DAYS,
  MAX_AMOUNT_VARIATION_PCT,
  MONTHLY_MAX_INTERVAL_DAYS,
  MONTHLY_MIN_INTERVAL_DAYS,
} from './constants'
import { amountVariation, median, medianMoney, roundMoney } from './money'
import {
  describeConfidence,
  dedupePostings,
  groupByMerchant,
  hasEnoughHistory,
  intervalsBetween,
  projectNextDate,
} from './recurrence'

export interface IncomeDetectionResult {
  /** Every deposit stream that met the rules, best candidate first. */
  candidates: PredictedEvent[]
  /**
   * The stream treated as the user's paycheck. The projected low balance is
   * measured against this event. Null when nothing qualified.
   */
  primary: PredictedEvent | null
}

/** Classify a set of gaps into a cadence, or null if they fit neither window. */
function classifyCadence(intervals: number[]): Cadence | null {
  const allWithin = (min: number, max: number) =>
    intervals.every((interval) => interval >= min && interval <= max)

  if (allWithin(BIWEEKLY_MIN_INTERVAL_DAYS, BIWEEKLY_MAX_INTERVAL_DAYS)) {
    return 'biweekly'
  }
  if (allWithin(MONTHLY_MIN_INTERVAL_DAYS, MONTHLY_MAX_INTERVAL_DAYS)) {
    return 'monthly'
  }
  return null
}

export function detectIncome(
  transactions: NormalizedTransaction[],
  asOfDate: string,
): IncomeDetectionResult {
  const deposits = transactions.filter((transaction) => transaction.amount > 0)
  const groups = groupByMerchant(deposits)
  const candidates: PredictedEvent[] = []
  const historicalTotals = new Map<string, number>()

  for (const [merchantKey, rawGroup] of groups) {
    const group = dedupePostings(rawGroup)
    if (!hasEnoughHistory(group)) continue

    const intervals = intervalsBetween(group)
    const cadence = classifyCadence(intervals)
    if (cadence === null) continue

    const amounts = group.map((transaction) => transaction.amount)
    const variation = amountVariation(amounts)
    if (variation > MAX_AMOUNT_VARIATION_PCT) continue

    const medianIntervalDays = median(intervals)
    const last = group[group.length - 1]
    const { confidence, confidenceReason } = describeConfidence(
      group.length,
      variation,
    )

    historicalTotals.set(
      merchantKey,
      amounts.reduce((sum, amount) => sum + amount, 0),
    )

    candidates.push({
      id: `income:${merchantKey}`,
      kind: 'income',
      merchantKey,
      displayName: last.normalizedMerchant,
      amount: medianMoney(amounts),
      date: projectNextDate(last.date, cadence, medianIntervalDays, asOfDate),
      evidence: {
        transactions: group,
        intervalsDays: intervals,
        medianIntervalDays,
        amountVariationPct: variation,
        cadence,
        confidence,
        confidenceReason,
      },
      source: 'detected',
      isPrimaryIncome: false,
    })
  }

  /**
   * Choosing between multiple income streams.
   *
   * A user can have several qualifying deposit streams — a paycheck, a monthly
   * transfer from a parent, a recurring reimbursement. FinAhead picks the one
   * with the LARGEST TOTAL HISTORICAL DEPOSIT VOLUME as the primary income
   * source, because that is the stream the user's budget actually rests on, and
   * because total volume is stable against a small stream that happens to be
   * due sooner.
   *
   * Ties are broken, in order, by: more deposits on record, then the earlier
   * next expected date, then merchant name (so the result is never dependent on
   * input ordering).
   */
  const ranked = [...candidates].sort((a, b) => {
    const totalA = historicalTotals.get(a.merchantKey) ?? 0
    const totalB = historicalTotals.get(b.merchantKey) ?? 0
    if (totalA !== totalB) return totalB - totalA

    const countA = a.evidence?.transactions.length ?? 0
    const countB = b.evidence?.transactions.length ?? 0
    if (countA !== countB) return countB - countA

    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    return a.merchantKey.localeCompare(b.merchantKey)
  })

  const primaryKey = ranked[0]?.merchantKey
  const marked = ranked.map((candidate) => ({
    ...candidate,
    isPrimaryIncome: candidate.merchantKey === primaryKey,
  }))

  return {
    candidates: marked,
    primary: marked.find((candidate) => candidate.isPrimaryIncome) ?? null,
  }
}

/**
 * Build the income event for the manual fallback, used when detection finds
 * nothing and the user tells FinAhead when they next expect to be paid.
 */
export function createManualIncomeEvent(
  date: string,
  amount: number,
): PredictedEvent {
  return {
    id: 'income:manual',
    kind: 'income',
    merchantKey: 'manual-income',
    displayName: 'Expected income (entered by you)',
    amount: roundMoney(Math.abs(amount)),
    date,
    evidence: null,
    source: 'user-manual',
    isPrimaryIncome: true,
  }
}
