/**
 * Phase 3 — MoneyData external-realism and compatibility holdout.
 *
 * This runs FinAhead's real production functions over a real anonymised bank
 * account and reports what happened. It is a compatibility and realism check,
 * not an accuracy score: MoneyData carries no FinAhead recurrence labels, so no
 * precision/recall is computed here over the full dataset. The small reviewed
 * holdout lives in `reviewed-labels.ts` and is scored separately.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { adaptMoneyData, toFinAheadCsv, SOURCE } from './adapt.mjs'
import { parseCsv } from '../../src/lib/parseCsv'
import { normalizeTransactions } from '../../src/domain/normalizeMerchant'
import { detectRecurringExpenses } from '../../src/domain/detectRecurringExpenses'
import { detectIncome } from '../../src/domain/detectIncome'
import { buildForecast } from '../../src/domain/buildForecast'
import { addDays, diffDays } from '../../src/domain/dateUtils'
import { toCents } from '../../src/domain/money'

const DATA = resolve(
  import.meta.dirname,
  '.data/laramee26openBankTransactionData.xlsx',
)
const OUT = resolve(import.meta.dirname, '.data')

/** Product-like observation window: the detectors are tuned for ~3 months. */
const WINDOW_DAYS = 95

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[index]
}

export function run() {
  const started = Date.now()
  const heapBefore = process.memoryUsage().heapUsed

  // ---- adapt ------------------------------------------------------------
  const adapted = adaptMoneyData(DATA)
  const csv = toFinAheadCsv(adapted.accepted)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(resolve(OUT, 'moneydata-finahead.csv'), csv)

  // ---- balance reconciliation (independent of FinAhead) ------------------
  // Walks the published balances in chronological order and checks that each
  // one equals the previous balance plus the signed amount, in integer pence.
  let exact = 0
  let compared = 0
  let maxDeltaMinor = 0
  const mismatches: { row: number; expected: number; actual: number }[] = []
  for (let i = 1; i < adapted.accepted.length; i += 1) {
    const previous = adapted.accepted[i - 1]
    const current = adapted.accepted[i]
    const expected = previous.balanceMinor + current.amountMinor
    compared += 1
    if (expected === current.balanceMinor) exact += 1
    else {
      const delta = Math.abs(expected - current.balanceMinor)
      maxDeltaMinor = Math.max(maxDeltaMinor, delta)
      if (mismatches.length < 10) {
        mismatches.push({ row: current.sourceRow, expected, actual: current.balanceMinor })
      }
    }
  }

  // ---- production parser -------------------------------------------------
  const parsed = parseCsv(csv)
  const normalized = normalizeTransactions(parsed.transactions)
  // Detection reads dates, so give it date order; the CSV itself stays in
  // statement order exactly as the bank published it.
  const byDate = [...normalized].sort((a, b) => (a.date < b.date ? -1 : 1))
  const uniqueMerchants = new Set(normalized.map((t) => t.merchantKey))
  const categories = new Set(
    parsed.transactions.map((t) => t.category).filter((c) => c !== ''),
  )

  // Reported, not required: real statements are not strictly date-ordered.
  const chronological = parsed.transactions.every(
    (t, i) => i === 0 || parsed.transactions[i - 1].date <= t.date,
  )

  // Contrast figure: what reconciliation looks like if the rows are re-sorted
  // by date, which is the intuitive but wrong thing to do.
  const dateSorted = [...adapted.accepted].sort((a, b) =>
    a.date === b.date ? a.sourceRow - b.sourceRow : a.date < b.date ? -1 : 1,
  )
  let dateSortedExact = 0
  for (let i = 1; i < dateSorted.length; i += 1) {
    if (dateSorted[i - 1].balanceMinor + dateSorted[i].amountMinor === dateSorted[i].balanceMinor) {
      dateSortedExact += 1
    }
  }

  // ---- detection over the full history ------------------------------------
  const lastDate = byDate[byDate.length - 1]!.date
  const fullExpenses = detectRecurringExpenses(byDate, lastDate)
  const fullIncome = detectIncome(byDate, lastDate)

  // ---- rolling product-shaped windows -------------------------------------
  const firstDate = byDate[0]!.date
  const spanDays = diffDays(firstDate, lastDate)
  const latencies: number[] = []
  let forecastsProduced = 0
  let windows = 0
  let windowsWithIncome = 0
  let windowExpenseCandidates = 0
  let windowIncomeCandidates = 0

  for (let offset = WINDOW_DAYS; offset <= spanDays; offset += 30) {
    const asOf = addDays(firstDate, offset)
    const windowStart = addDays(asOf, -WINDOW_DAYS)
    const slice = byDate.filter((t) => t.date >= windowStart && t.date < asOf)
    if (slice.length < 10) continue

    windows += 1
    const t0 = process.hrtime.bigint()
    const expenses = detectRecurringExpenses(slice, asOf)
    const income = detectIncome(slice, asOf)
    const forecast = buildForecast({
      currentBalance: 1000,
      asOfDate: asOf,
      predictions: [...expenses, ...income.candidates],
    })
    latencies.push(Number(process.hrtime.bigint() - t0) / 1e6)

    windowExpenseCandidates += expenses.length
    windowIncomeCandidates += income.candidates.length
    if (income.primary) windowsWithIncome += 1
    if (forecast.events.length >= 0) forecastsProduced += 1
  }

  const sorted = [...latencies].sort((a, b) => a - b)
  const heapAfter = process.memoryUsage().heapUsed

  return {
    source: SOURCE,
    rows: {
      sourceRows: adapted.totalSourceRows,
      blankRows: adapted.blankRows,
      accepted: adapted.accepted.length,
      rejected: adapted.rejected.length,
      rejectionReasons: adapted.rejected.reduce<Record<string, number>>((acc, r) => {
        acc[r.reason] = (acc[r.reason] ?? 0) + 1
        return acc
      }, {}),
      blankedCategories: adapted.blankedCategories,
    },
    schema: {
      parserAccepted: parsed.transactions.length,
      parserErrors: parsed.errors.length,
      parserErrorCodes: [...new Set(parsed.errors.map((e) => e.code))],
      skippedBlankRows: parsed.skippedBlankRows,
      strictlyDateOrdered: chronological,
      dateInversionsInStatementOrder: adapted.dateInversions,
      dateRange: [firstDate, lastDate],
      categories: categories.size,
      uniqueNormalizedMerchants: uniqueMerchants.size,
      rawDescriptions: new Set(parsed.transactions.map((t) => t.merchant)).size,
    },
    balances: {
      compared,
      exact,
      exactRate: compared === 0 ? 0 : exact / compared,
      maxDeltaMinor,
      exactRateIfDateSorted: compared === 0 ? 0 : dateSortedExact / compared,
      sampleMismatches: mismatches,
      debits: adapted.accepted.filter((r) => r.amountMinor < 0).length,
      credits: adapted.accepted.filter((r) => r.amountMinor > 0).length,
      zero: adapted.accepted.filter((r) => r.amountMinor === 0).length,
    },
    detection: {
      fullHistoryExpenseCandidates: fullExpenses.length,
      fullHistoryIncomeCandidates: fullIncome.candidates.length,
      fullHistoryPrimaryIncome: fullIncome.primary?.displayName ?? null,
      windows,
      windowsWithIncome,
      windowExpenseCandidates,
      windowIncomeCandidates,
      topExpenseMerchants: fullExpenses
        .slice(0, 15)
        .map((p) => ({
          merchant: p.displayName,
          amount: toCents(p.amount) / 100,
          occurrences: p.evidence?.transactions.length ?? 0,
          confidence: p.evidence?.confidence,
        })),
      incomeCandidates: fullIncome.candidates.map((p) => ({
        merchant: p.displayName,
        amount: toCents(p.amount) / 100,
        cadence: p.evidence?.cadence,
        occurrences: p.evidence?.transactions.length ?? 0,
      })),
    },
    performance: {
      forecastsProduced,
      p50Ms: percentile(sorted, 50),
      p95Ms: percentile(sorted, 95),
      p99Ms: percentile(sorted, 99),
      slowestMs: sorted[sorted.length - 1] ?? 0,
      totalWallMs: Date.now() - started,
      heapDeltaMb: (heapAfter - heapBefore) / 1024 / 1024,
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
    },
  }
}
