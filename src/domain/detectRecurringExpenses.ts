/**
 * Monthly recurring-expense detection.
 *
 * V1 looks for one thing only: a charge from the same merchant that arrives
 * about once a month for about the same amount. Weekly coffee, variable
 * groceries and one-off purchases are deliberately left out of the forecast —
 * a prediction FinAhead cannot justify with evidence is worse than no
 * prediction, because the user cannot check it.
 *
 * A candidate must satisfy ALL of:
 *   - negative amounts (money leaving the account)
 *   - the same normalised merchant
 *   - at least MIN_OCCURRENCES distinct postings
 *   - every observed gap inside the monthly window (25–35 days)
 *   - amount spread within MAX_AMOUNT_VARIATION_PCT
 *
 * Requiring every gap to be in range, rather than only the median, keeps a
 * merchant with gaps of 5 and 55 days (median 30) from being sold to the user
 * as a monthly bill.
 */

import type { NormalizedTransaction, PredictedEvent } from './types'
import {
  MAX_AMOUNT_VARIATION_PCT,
  MONTHLY_MAX_INTERVAL_DAYS,
  MONTHLY_MIN_INTERVAL_DAYS,
} from './constants'
import { amountVariation, median, medianMoney } from './money'
import {
  describeConfidence,
  dedupePostings,
  groupByMerchant,
  hasEnoughHistory,
  intervalsBetween,
  projectNextDate,
} from './recurrence'

export function detectRecurringExpenses(
  transactions: NormalizedTransaction[],
  asOfDate: string,
): PredictedEvent[] {
  const expenses = transactions.filter((transaction) => transaction.amount < 0)
  const groups = groupByMerchant(expenses)
  const predictions: PredictedEvent[] = []

  for (const [merchantKey, rawGroup] of groups) {
    const group = dedupePostings(rawGroup)
    if (!hasEnoughHistory(group)) continue

    const intervals = intervalsBetween(group)
    const everyIntervalIsMonthly = intervals.every(
      (interval) =>
        interval >= MONTHLY_MIN_INTERVAL_DAYS &&
        interval <= MONTHLY_MAX_INTERVAL_DAYS,
    )
    if (!everyIntervalIsMonthly) continue

    const magnitudes = group.map((transaction) => Math.abs(transaction.amount))
    const variation = amountVariation(magnitudes)
    if (variation > MAX_AMOUNT_VARIATION_PCT) continue

    const medianIntervalDays = median(intervals)
    const representativeAmount = medianMoney(magnitudes)
    const last = group[group.length - 1]
    const { confidence, confidenceReason } = describeConfidence(
      group.length,
      variation,
    )

    predictions.push({
      id: `expense:${merchantKey}`,
      kind: 'expense',
      merchantKey,
      displayName: last.normalizedMerchant,
      amount: -representativeAmount,
      date: projectNextDate(last.date, 'monthly', medianIntervalDays, asOfDate),
      evidence: {
        transactions: group,
        intervalsDays: intervals,
        medianIntervalDays,
        amountVariationPct: variation,
        cadence: 'monthly',
        confidence,
        confidenceReason,
      },
      source: 'detected',
      isPrimaryIncome: false,
    })
  }

  // Soonest first, then by merchant so the order never depends on Map iteration.
  return predictions.sort((a, b) =>
    a.date === b.date
      ? a.merchantKey.localeCompare(b.merchantKey)
      : a.date < b.date
        ? -1
        : 1,
  )
}
