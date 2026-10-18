/**
 * Scores FinAhead's detectors against the hand-reviewed MoneyData holdout.
 *
 * The detector sees only the 95-day review window. The labels were written from
 * the full seven-year history, so the detector has strictly less information
 * than the labeller — which is the realistic condition, not a handicap.
 *
 * Patterns labelled `ambiguous` are excluded from both matrices. One labelled
 * obligation (Corgi Homeplan) has no transactions inside the window at all and
 * is excluded too, with a note, because the detector has no opportunity to find
 * it; counting it as a miss would measure the window, not the detector.
 */

import { adaptMoneyData, toFinAheadCsv } from './adapt.mjs'
import { parseCsv } from '../../src/lib/parseCsv'
import { normalizeTransactions } from '../../src/domain/normalizeMerchant'
import { detectRecurringExpenses } from '../../src/domain/detectRecurringExpenses'
import { detectIncome } from '../../src/domain/detectIncome'
import { REVIEWED_PATTERNS, REVIEW_WINDOW } from './reviewed-labels'
import { resolve } from 'node:path'

export interface Matrix {
  tp: number; fp: number; tn: number; fn: number
  precision: number; recall: number; f1: number
  falsePositives: string[]; falseNegatives: string[]
}

function matrix(
  cases: { key: string; display: string; actual: boolean; predicted: boolean }[],
): Matrix {
  const tp = cases.filter((c) => c.actual && c.predicted).length
  const fp = cases.filter((c) => !c.actual && c.predicted).length
  const tn = cases.filter((c) => !c.actual && !c.predicted).length
  const fn = cases.filter((c) => c.actual && !c.predicted).length
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
  return {
    tp, fp, tn, fn, precision, recall,
    f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
    falsePositives: cases.filter((c) => !c.actual && c.predicted).map((c) => c.display),
    falseNegatives: cases.filter((c) => c.actual && !c.predicted).map((c) => c.display),
  }
}

export function run() {
  const adapted = adaptMoneyData(
    resolve(import.meta.dirname, '.data/laramee26openBankTransactionData.xlsx'),
  )
  const all = normalizeTransactions(parseCsv(toFinAheadCsv(adapted.accepted)).transactions)
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  const window = all.filter(
    (t) => t.date >= REVIEW_WINDOW.start && t.date < REVIEW_WINDOW.asOf,
  )

  const predictedExpenses = new Set(
    detectRecurringExpenses(window, REVIEW_WINDOW.asOf).map((p) => p.merchantKey),
  )
  const incomeResult = detectIncome(window, REVIEW_WINDOW.asOf)
  const predictedIncome = new Set(incomeResult.candidates.map((p) => p.merchantKey))

  const scorable = REVIEWED_PATTERNS.filter(
    (p) => p.label !== 'ambiguous' && p.evidence.occurrencesInWindow > 0,
  )
  const excludedAmbiguous = REVIEWED_PATTERNS.filter((p) => p.label === 'ambiguous')
  const excludedOutsideWindow = REVIEWED_PATTERNS.filter(
    (p) => p.label !== 'ambiguous' && p.evidence.occurrencesInWindow === 0,
  )

  const expenseCases = scorable
    .filter((p) => p.label !== 'income')
    .map((p) => ({
      key: p.merchantKey, display: p.display,
      actual: p.label === 'recurring-expense',
      predicted: predictedExpenses.has(p.merchantKey),
    }))

  const incomeCases = scorable
    .filter((p) => p.label !== 'recurring-expense')
    .map((p) => ({
      key: p.merchantKey, display: p.display,
      actual: p.label === 'income',
      predicted: predictedIncome.has(p.merchantKey),
    }))

  return {
    window: REVIEW_WINDOW,
    windowTransactions: window.length,
    windowMerchants: new Set(window.map((t) => t.merchantKey)).size,
    labelled: REVIEWED_PATTERNS.length,
    scored: scorable.length,
    excludedAmbiguous: excludedAmbiguous.map((p) => p.display),
    excludedOutsideWindow: excludedOutsideWindow.map((p) => p.display),
    recurringExpense: matrix(expenseCases),
    income: matrix(incomeCases),
    primaryIncomeChosen: incomeResult.primary?.displayName ?? null,
  }
}
