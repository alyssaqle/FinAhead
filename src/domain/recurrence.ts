/**
 * Shared internals for the two detectors (expenses and income).
 *
 * Both detectors follow the same shape — group by normalised merchant, remove
 * duplicate postings, measure the gaps, check the amount spread, project the
 * next date — so that shape lives here once and the detector files hold only
 * the rules that actually differ between money going out and money coming in.
 */

import type {
  Cadence,
  ConfidenceLabel,
  NormalizedTransaction,
} from './types'
import {
  MIN_OCCURRENCES,
  PREFERRED_OCCURRENCES,
  STABLE_AMOUNT_VARIATION_PCT,
} from './constants'
import { addDays, addMonthsClamped, diffDays } from './dateUtils'

/** Group transactions by their normalised merchant key, preserving date order. */
export function groupByMerchant(
  transactions: NormalizedTransaction[],
): Map<string, NormalizedTransaction[]> {
  const groups = new Map<string, NormalizedTransaction[]>()
  for (const transaction of transactions) {
    const existing = groups.get(transaction.merchantKey)
    if (existing) existing.push(transaction)
    else groups.set(transaction.merchantKey, [transaction])
  }
  for (const group of groups.values()) {
    group.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  }
  return groups
}

/**
 * Collapse duplicate postings — identical merchant, date and amount — to a
 * single occurrence.
 *
 * Statements sometimes contain the same charge twice (a re-export, a pending
 * row settling). Left in place, the duplicate creates a zero-day interval that
 * drags the median below the monthly window and hides a real recurring bill.
 * The original rows are still shown as evidence; only the interval maths sees
 * the deduplicated list.
 */
export function dedupePostings(
  transactions: NormalizedTransaction[],
): NormalizedTransaction[] {
  const seen = new Set<string>()
  const result: NormalizedTransaction[] = []
  for (const transaction of transactions) {
    const signature = `${transaction.date}|${transaction.merchantKey}|${transaction.amount}`
    if (seen.has(signature)) continue
    seen.add(signature)
    result.push(transaction)
  }
  return result
}

/** Day gaps between consecutive (date-sorted) transactions. */
export function intervalsBetween(transactions: NormalizedTransaction[]): number[] {
  const intervals: number[] = []
  for (let index = 1; index < transactions.length; index += 1) {
    intervals.push(diffDays(transactions[index - 1].date, transactions[index].date))
  }
  return intervals
}

/**
 * The next occurrence strictly after `asOfDate`.
 *
 * Monthly patterns advance by calendar month from the last occurrence, keeping
 * the day of month and clamping at the end of short months, because that is how
 * rent and subscriptions actually bill. Biweekly patterns advance by the
 * observed median gap in days.
 *
 * If the last occurrence is old enough that the next date would already be in
 * the past, the projection keeps advancing until it lands in the future, so a
 * missed or late bill still surfaces as upcoming rather than disappearing.
 */
export function projectNextDate(
  lastDate: string,
  cadence: Cadence,
  medianIntervalDays: number,
  asOfDate: string,
): string {
  let candidate = lastDate
  const step = Math.round(medianIntervalDays)
  // Bounded loop: a dataset is at most a few years wide, so 400 steps is far
  // more than enough and guarantees termination on unexpected input.
  for (let guard = 0; guard < 400; guard += 1) {
    candidate =
      cadence === 'monthly'
        ? addMonthsClamped(candidate, 1)
        : addDays(candidate, step)
    if (candidate > asOfDate) return candidate
  }
  return candidate
}

/**
 * Transparency label for a pattern.
 *
 * `high`   — three or more occurrences and a near-identical amount every time
 * `medium` — three or more occurrences, but the amount moves around
 * `low`    — only two occurrences, which is a single interval of evidence
 */
export function describeConfidence(
  occurrences: number,
  amountVariationPct: number,
): { confidence: ConfidenceLabel; confidenceReason: string } {
  if (occurrences < PREFERRED_OCCURRENCES) {
    return {
      confidence: 'low',
      confidenceReason: `Based on only ${occurrences} previous payments, which is the minimum FinAhead will use.`,
    }
  }
  if (amountVariationPct <= STABLE_AMOUNT_VARIATION_PCT) {
    return {
      confidence: 'high',
      confidenceReason: `Based on ${occurrences} previous payments of a nearly identical amount.`,
    }
  }
  return {
    confidence: 'medium',
    confidenceReason: `Based on ${occurrences} previous payments, but the amount has varied by ${Math.round(
      amountVariationPct * 100,
    )}%.`,
  }
}

/** Groups smaller than this cannot be assessed at all. */
export function hasEnoughHistory(transactions: NormalizedTransaction[]): boolean {
  return transactions.length >= MIN_OCCURRENCES
}
