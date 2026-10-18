/**
 * Hypothetical value stress test for an investment preflight.
 *
 * This is arithmetic on a number the user typed, not a forecast. It answers one
 * question — "if this amount were worth less, how much less would it be?" — and
 * it deliberately has no opinion about whether any of these outcomes is likely.
 * FinAhead has no market data, no model and no view on any asset, so the
 * declines are fixed, user-visible stress levels rather than probabilities.
 *
 * Crucially, none of this touches the cash timeline. The cash left the account
 * on the investment date; what the holding is subsequently worth does not put
 * money back into the account, and the MVP models no selling, settlement, tax,
 * dividend, gain, fee or withdrawal.
 */

import { formatCurrency } from './money'
import type { InvestmentCategory } from './types'

/**
 * The stress levels shown to the user, as fractional changes in value.
 * Named here rather than in a component so the table cannot drift from tests.
 */
export const STRESS_CHANGES = [0, -0.1, -0.25, -0.5] as const

export interface StressRow {
  /** Fractional change, e.g. -0.25. */
  change: number
  /** User-facing description of the stress level. */
  label: string
  /** Hypothetical value of the holding under this stress, in dollars. */
  value: number
  /** Value minus the amount invested. Zero for the no-change row. */
  difference: number
}

/** Human-readable names for the categories. Descriptive only. */
export const CATEGORY_LABELS: Record<InvestmentCategory, string> = {
  stock: 'Stock',
  etf: 'ETF',
  crypto: 'Crypto',
  other: 'Other',
}

function describeChange(change: number): string {
  if (change === 0) return 'No change'
  return `${Math.round(Math.abs(change) * 100)}% decline`
}

/**
 * Apply a fractional change to a cent amount, rounding half away from zero so
 * the direction never depends on the sign — the same rule the rest of the app
 * uses at its rounding boundaries.
 */
function applyChangeToCents(cents: number, change: number): number {
  const raw = cents * (1 + change)
  const rounded = Math.sign(raw) * Math.round(Math.abs(raw))
  return rounded || 0
}

/**
 * Build the stress table for an invested amount.
 *
 * The amount is taken as a magnitude: the user enters a positive number, and
 * the sign convention for the cash side is applied by the forecast engine, not
 * here.
 */
export function buildStressTable(amount: number): StressRow[] {
  const cents = Math.round(Math.abs(amount) * 100)

  return STRESS_CHANGES.map((change) => {
    const valueCents = applyChangeToCents(cents, change)
    return {
      change,
      label: describeChange(change),
      value: valueCents / 100,
      difference: (valueCents - cents) / 100,
    }
  })
}

/**
 * A sentence describing the whole table, for a screen-reader summary. The
 * figures are the same ones the table renders.
 */
export function describeStressTable(amount: number, rows: StressRow[]): string {
  const parts = rows.map(
    (row) => `${row.label}, ${formatCurrency(row.value)}`,
  )
  return `Hypothetical value of the ${formatCurrency(
    Math.abs(amount),
  )} invested, under four stress levels: ${parts.join('; ')}. These are stress levels, not predictions.`
}
