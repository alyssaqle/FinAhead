/** Shared fixtures for the domain tests. Not a test file itself. */

import type { NormalizedTransaction, Transaction } from '../types'
import { normalizeTransactions } from '../normalizeMerchant'

export type Row = [date: string, merchant: string, amount: number, category?: string]

/** Build normalised transactions from compact `[date, merchant, amount]` rows. */
export function txns(rows: Row[]): NormalizedTransaction[] {
  const transactions: Transaction[] = rows.map(
    ([date, merchant, amount, category], index) => ({
      id: `t-${index + 1}`,
      date,
      merchant,
      amount,
      category: category ?? '',
    }),
  )
  return normalizeTransactions(transactions)
}

import type { PredictedEvent } from '../types'

/** A predicted expense with just enough shape for the forecast engine. */
export function expense(
  name: string,
  date: string,
  amount: number,
): PredictedEvent {
  return {
    id: `expense:${name.toLowerCase()}`,
    kind: 'expense',
    merchantKey: name.toLowerCase(),
    displayName: name,
    amount: -Math.abs(amount),
    date,
    evidence: null,
    source: 'detected',
    isPrimaryIncome: false,
  }
}

/** A predicted income deposit. Marked primary unless told otherwise. */
export function income(
  name: string,
  date: string,
  amount: number,
  isPrimaryIncome = true,
): PredictedEvent {
  return {
    id: `income:${name.toLowerCase()}`,
    kind: 'income',
    merchantKey: name.toLowerCase(),
    displayName: name,
    amount: Math.abs(amount),
    date,
    evidence: null,
    source: 'detected',
    isPrimaryIncome,
  }
}
