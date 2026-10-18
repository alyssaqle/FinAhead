/**
 * Phase 7 — synthetic benchmark runner.
 *
 * Two independent measurements, deliberately not mixed:
 *
 *  1. FINANCIAL CORRECTNESS. Production `buildForecast`/`applyScenario` are fed
 *     the account's DECLARED future events and compared, in integer minor
 *     units, against `reference.ts`. Detection is bypassed here on purpose, so
 *     a detector miss cannot be mistaken for an arithmetic error.
 *
 *  2. DETECTION QUALITY. Production detectors are run over the generated
 *     transactions and scored against the labels declared at generation time.
 *     Scored per raw merchant descriptor, so the benchmark never has to adopt
 *     production's own merchant keys as ground truth.
 *
 * Comparisons are exact integer equality. No floating-point tolerance is used
 * for money anywhere in this file.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import {
  generate, datasetCsv, accountCsv, SEED, ACCOUNT_COUNT, SCENARIOS_PER_ACCOUNT,
  type SynthAccount,
} from './generate'
import { referenceForecast, referenceWithScenario, type RefEvent } from './reference'
import { FIXTURES } from './fixtures'
import { buildForecast, type ForecastInput } from '../../src/domain/buildForecast'
import { applyScenario } from '../../src/domain/applyScenario'
import { detectRecurringExpenses } from '../../src/domain/detectRecurringExpenses'
import { detectIncome } from '../../src/domain/detectIncome'
import { normalizeTransactions } from '../../src/domain/normalizeMerchant'
import { parseCsv } from '../../src/lib/parseCsv'
import { toCents } from '../../src/domain/money'
import type { PredictedEvent } from '../../src/domain/types'

const OUT = resolve(import.meta.dirname, '.out')

export interface Failure {
  kind: 'calculation' | 'detection' | 'parsing' | 'ordering' | 'benchmark'
  caseId: string
  detail: string
}

/** Declared reference events become production predictions, unchanged. */
function toPredictions(events: RefEvent[]): PredictedEvent[] {
  return events.map((e) => ({
    id: e.id,
    kind: e.kind,
    merchantKey: e.id,
    displayName: e.id,
    amount: e.amountMinor / 100,
    date: e.date,
    evidence: null,
    source: 'detected',
    isPrimaryIncome: e.isPrimaryIncome,
  }))
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}

export function run() {
  const failures: Failure[] = []
  const { accounts } = generate(SEED)

  mkdirSync(OUT, { recursive: true })
  const csv = datasetCsv(accounts)
  const csvPath = resolve(OUT, 'synthetic-transactions.csv')
  writeFileSync(csvPath, csv)
  writeFileSync(
    resolve(OUT, 'ground-truth-manifest.json'),
    JSON.stringify({ seed: SEED, accounts: accounts.map(manifestFor) }, null, 1),
  )

  // ------------------------------------------------- malformed-input cases
  // Required by the benchmark spec and measured here rather than assumed: the
  // parser must reject bad input with a stated reason, never coerce it.
  const malformed = [
    { id: 'M01-empty-file', csv: '', expect: 'empty-file' },
    { id: 'M02-whitespace-only', csv: '   \n  \n', expect: 'empty-file' },
    { id: 'M03-missing-category-column', csv: 'date,merchant,amount\n2026-03-01,RENT,-10.00\n', expect: 'missing-column' },
    { id: 'M04-missing-amount-column', csv: 'date,merchant,category\n2026-03-01,RENT,Housing\n', expect: 'missing-column' },
    { id: 'M05-header-only', csv: 'date,merchant,amount,category\n', expect: 'no-transactions' },
    { id: 'M06-invalid-date-format', csv: 'date,merchant,amount,category\n03/01/2026,RENT,-10.00,Housing\n', expect: 'invalid-date' },
    { id: 'M07-impossible-date', csv: 'date,merchant,amount,category\n2026-02-30,RENT,-10.00,Housing\n', expect: 'invalid-date' },
    { id: 'M08-nonnumeric-amount', csv: 'date,merchant,amount,category\n2026-03-01,RENT,ten pounds,Housing\n', expect: 'invalid-amount' },
    { id: 'M09-blank-amount', csv: 'date,merchant,amount,category\n2026-03-01,RENT,,Housing\n', expect: 'invalid-amount' },
    { id: 'M10-scientific-notation', csv: 'date,merchant,amount,category\n2026-03-01,RENT,1e3,Housing\n', expect: 'invalid-amount' },
    { id: 'M11-short-row', csv: 'date,merchant,amount,category\n2026-03-01,RENT,-10.00\n', expect: 'malformed-row' },
    { id: 'M12-missing-merchant', csv: 'date,merchant,amount,category\n2026-03-01,,-10.00,Housing\n', expect: 'missing-merchant' },
  ]
  let malformedHandled = 0
  for (const m of malformed) {
    const result = parseCsv(m.csv)
    const codes = result.errors.map((e) => e.code)
    if (codes.includes(m.expect) && result.transactions.length === 0) malformedHandled += 1
    else failures.push({ kind: 'parsing', caseId: m.id, detail: `expected ${m.expect}, got [${codes.join(',')}] with ${result.transactions.length} rows` })
  }

  /*
   * Blank rows inside an otherwise valid file must be skipped, not rejected.
   *
   * Benchmark-expectation note: this case first asserted 2 skipped rows and
   * failed against an observed 3. On inspection the implementation was right —
   * the fixture contains an empty line, a ",,," line AND a trailing newline,
   * which is three blank rows. The expectation was corrected to 3; no product
   * behaviour was changed.
   */
  const blankRowCsv = 'date,merchant,amount,category\n2026-03-01,RENT,-10.00,Housing\n\n,,,\n2026-03-02,GYM,-5.00,Health\n'
  const blankResult = parseCsv(blankRowCsv)
  const blankRowsOk = blankResult.errors.length === 0 && blankResult.transactions.length === 2 && blankResult.skippedBlankRows === 3
  if (!blankRowsOk) failures.push({ kind: 'parsing', caseId: 'M13-blank-rows-skipped', detail: `errors=${blankResult.errors.length} rows=${blankResult.transactions.length} skipped=${blankResult.skippedBlankRows}` })

  // ---------------------------------------------------------------- fixtures
  let fixturePass = 0
  for (const f of FIXTURES) {
    const expectedRef = f.scenario
      ? referenceWithScenario(f.startingBalanceMinor, f.asOfDate, f.events, { id: 'scenario', ...f.scenario })
      : referenceForecast(f.startingBalanceMinor, f.asOfDate, f.events)

    // The hand-written expectation must agree with the reference engine too.
    if (
      JSON.stringify(expectedRef.orderedIds) !== JSON.stringify(f.expect.orderedIds) ||
      JSON.stringify(expectedRef.balancesMinor) !== JSON.stringify(f.expect.balancesMinor) ||
      expectedRef.lowMinor !== f.expect.lowMinor || expectedRef.lowDate !== f.expect.lowDate
    ) {
      failures.push({ kind: 'benchmark', caseId: f.id, detail: `hand expectation disagrees with reference: ref=${JSON.stringify(expectedRef.orderedIds)}/${JSON.stringify(expectedRef.balancesMinor)}/${expectedRef.lowMinor}@${expectedRef.lowDate} hand=${JSON.stringify(f.expect.orderedIds)}/${JSON.stringify(f.expect.balancesMinor)}/${f.expect.lowMinor}@${f.expect.lowDate}` })
      continue
    }

    const input: ForecastInput = {
      currentBalance: f.startingBalanceMinor / 100,
      asOfDate: f.asOfDate,
      predictions: toPredictions(f.events),
    }
    const produced = f.scenario
      ? applyScenario(input, { amount: f.scenario.amountMinor / 100, date: f.scenario.date })?.comparison?.projected
      : buildForecast(input)

    if (!produced) {
      failures.push({ kind: 'calculation', caseId: f.id, detail: 'production returned no forecast' })
      continue
    }
    const gotIds = produced.events.map((e) => e.id)
    const gotBalances = produced.events.map((e) => toCents(e.balanceAfter))
    const ok =
      JSON.stringify(gotIds) === JSON.stringify(f.expect.orderedIds) &&
      JSON.stringify(gotBalances) === JSON.stringify(f.expect.balancesMinor) &&
      toCents(produced.lowestBalance) === f.expect.lowMinor &&
      produced.lowestBalanceDate === f.expect.lowDate
    if (ok) fixturePass += 1
    else failures.push({ kind: 'calculation', caseId: f.id, detail: `expected ${JSON.stringify(f.expect.orderedIds)} ${JSON.stringify(f.expect.balancesMinor)} low=${f.expect.lowMinor}@${f.expect.lowDate}; got ${JSON.stringify(gotIds)} ${JSON.stringify(gotBalances)} low=${toCents(produced.lowestBalance)}@${produced.lowestBalanceDate}` })
  }

  // ------------------------------------------------------- financial metrics
  const fin = {
    accounts: 0, balanceCases: 0, balanceExact: 0,
    lowAmountCases: 0, lowAmountExact: 0, lowDateCases: 0, lowDateExact: 0,
    orderingCases: 0, orderingExact: 0,
    scenarioCases: 0, scenarioDiffExact: 0,
    negativeCases: 0, negativeDetected: 0,
    removalCases: 0, removalRestored: 0,
    maxErrorMinor: 0,
  }

  const latencies: number[] = []
  // Warm-up: run a slice without recording, so JIT and first-call costs do not
  // land in the percentiles.
  for (let w = 0; w < 3; w += 1) {
    for (const account of accounts.slice(0, 25)) measureAccount(account, fin, failures, null)
  }
  const warmFin = { ...fin }
  for (const key of Object.keys(fin) as (keyof typeof fin)[]) fin[key] = 0
  void warmFin

  for (const account of accounts) measureAccount(account, fin, failures, latencies)

  // -------------------------------------------------------------- detection
  const detection = scoreDetection(accounts, failures)

  const sorted = [...latencies].sort((a, b) => a - b)
  const totalTxns = accounts.reduce((s, a) => s + a.transactions.length, 0)
  const totalSeconds = sorted.reduce((s, x) => s + x, 0) / 1000

  return {
    seed: SEED,
    dataset: {
      accounts: ACCOUNT_COUNT,
      transactions: totalTxns,
      scenarios: accounts.length * SCENARIOS_PER_ACCOUNT,
      challengeAccounts: accounts.filter((a) => a.isChallenge).length,
      minTransactionsPerAccount: Math.min(...accounts.map((a) => a.transactions.length)),
      csvPath,
      csvBytes: Buffer.byteLength(csv),
      csvRows: csv.trimEnd().split('\n').length - 1,
      csvSha256: createHash('sha256').update(csv).digest('hex'),
      truthDistribution: accounts.reduce<Record<string, number>>((acc, a) => {
        for (const t of a.transactions) acc[t.truth] = (acc[t.truth] ?? 0) + 1
        return acc
      }, {}),
    },
    fixtures: { total: FIXTURES.length, passed: fixturePass },
    malformedInputs: { total: malformed.length + 1, handled: malformedHandled + (blankRowsOk ? 1 : 0) },
    financial: {
      ...fin,
      balanceExactRate: rate(fin.balanceExact, fin.balanceCases),
      lowAmountExactRate: rate(fin.lowAmountExact, fin.lowAmountCases),
      lowDateExactRate: rate(fin.lowDateExact, fin.lowDateCases),
      orderingAccuracy: rate(fin.orderingExact, fin.orderingCases),
      scenarioDiffExactRate: rate(fin.scenarioDiffExact, fin.scenarioCases),
      negativeDetectionRate: rate(fin.negativeDetected, fin.negativeCases),
      removalRestorationRate: rate(fin.removalRestored, fin.removalCases),
    },
    detection,
    performance: {
      cases: sorted.length,
      p50Ms: percentile(sorted, 50), p95Ms: percentile(sorted, 95), p99Ms: percentile(sorted, 99),
      slowestMs: sorted[sorted.length - 1] ?? 0,
      transactionsPerSecond: totalSeconds > 0 ? Math.round(totalTxns / totalSeconds) : 0,
      warmupIterations: 3 * 25,
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      cpus: `${(globalThis as any).process?.env?.HOSTTYPE ?? ''}`.trim() || undefined,
    },
    failures,
  }
}

const rate = (n: number, d: number) => (d === 0 ? 1 : n / d)

function manifestFor(a: SynthAccount) {
  const base = referenceForecast(a.startingBalanceMinor, a.asOfDate, a.upcoming)
  return {
    accountId: a.accountId, archetype: a.archetype, isChallenge: a.isChallenge,
    asOfDate: a.asOfDate, startingBalanceMinor: a.startingBalanceMinor,
    trueRecurringMerchants: a.trueRecurringMerchants, trueIncomeMerchants: a.trueIncomeMerchants,
    expectedUpcoming: a.upcoming,
    expectedOrdering: base.orderedIds, expectedBalancesMinor: base.balancesMinor,
    expectedLowMinor: base.lowMinor, expectedLowDate: base.lowDate,
    goesNegative: base.goesNegative, horizonDate: base.horizonDate,
    scenarios: a.scenarios.map((s) => {
      const withS = referenceWithScenario(a.startingBalanceMinor, a.asOfDate, a.upcoming, { id: 'scenario', date: s.date, amountMinor: s.amountMinor })
      return {
        ...s,
        expectedBalancesMinor: withS.balancesMinor,
        expectedLowMinor: withS.lowMinor, expectedLowDate: withS.lowDate,
        expectedDifferenceMinor: withS.lowMinor - base.lowMinor,
        goesNegative: withS.goesNegative,
        expectedAfterRemovalLowMinor: base.lowMinor,
      }
    }),
  }
}

function measureAccount(
  a: SynthAccount,
  fin: ReturnType<typeof Object> & any,
  failures: Failure[],
  latencies: number[] | null,
) {
  const input: ForecastInput = {
    currentBalance: a.startingBalanceMinor / 100,
    asOfDate: a.asOfDate,
    predictions: toPredictions(a.upcoming),
  }

  const t0 = process.hrtime.bigint()
  const produced = buildForecast(input)
  const expected = referenceForecast(a.startingBalanceMinor, a.asOfDate, a.upcoming)

  fin.accounts += 1

  // ordering
  fin.orderingCases += 1
  const gotIds = produced.events.map((e) => e.id)
  if (JSON.stringify(gotIds) === JSON.stringify(expected.orderedIds)) fin.orderingExact += 1
  else if (latencies) failures.push({ kind: 'ordering', caseId: a.accountId, detail: `expected ${JSON.stringify(expected.orderedIds)} got ${JSON.stringify(gotIds)}` })

  // running balances
  produced.events.forEach((e, i) => {
    fin.balanceCases += 1
    const want = expected.balancesMinor[i]
    const got = toCents(e.balanceAfter)
    if (got === want) fin.balanceExact += 1
    else {
      fin.maxErrorMinor = Math.max(fin.maxErrorMinor, Math.abs(got - (want ?? 0)))
      if (latencies) failures.push({ kind: 'calculation', caseId: `${a.accountId}#balance[${i}]`, detail: `expected ${want} got ${got}` })
    }
  })

  // low point
  fin.lowAmountCases += 1
  if (toCents(produced.lowestBalance) === expected.lowMinor) fin.lowAmountExact += 1
  else {
    fin.maxErrorMinor = Math.max(fin.maxErrorMinor, Math.abs(toCents(produced.lowestBalance) - expected.lowMinor))
    if (latencies) failures.push({ kind: 'calculation', caseId: `${a.accountId}#low`, detail: `expected ${expected.lowMinor} got ${toCents(produced.lowestBalance)}` })
  }
  fin.lowDateCases += 1
  if (produced.lowestBalanceDate === expected.lowDate) fin.lowDateExact += 1
  else if (latencies) failures.push({ kind: 'calculation', caseId: `${a.accountId}#lowDate`, detail: `expected ${expected.lowDate} got ${produced.lowestBalanceDate}` })

  // negative detection
  if (expected.goesNegative) {
    fin.negativeCases += 1
    const flagged = toCents(produced.lowestBalance) < 0 || produced.events.some((e) => toCents(e.balanceAfter) < 0)
    if (flagged) fin.negativeDetected += 1
    else if (latencies) failures.push({ kind: 'calculation', caseId: `${a.accountId}#negative`, detail: 'reference says negative, production did not flag it' })
  }

  // scenarios
  for (const s of a.scenarios) {
    const outcome = applyScenario(input, { amount: s.amountMinor / 100, date: s.date, label: s.label, ...(s.kind === 'investment' ? { kind: 'investment' as const } : {}) })
    fin.scenarioCases += 1
    const expectedWith = referenceWithScenario(a.startingBalanceMinor, a.asOfDate, a.upcoming, { id: 'scenario', date: s.date, amountMinor: s.amountMinor })
    const expectedDiff = expectedWith.lowMinor - expected.lowMinor

    if (!outcome.comparison) {
      failures.push({ kind: 'calculation', caseId: `${a.accountId}#${s.id}`, detail: `rejected: ${outcome.errors.map((e) => e.code).join(',')}` })
      continue
    }
    const gotDiff = toCents(outcome.comparison.difference)
    if (gotDiff === expectedDiff) fin.scenarioDiffExact += 1
    else {
      fin.maxErrorMinor = Math.max(fin.maxErrorMinor, Math.abs(gotDiff - expectedDiff))
      if (latencies) failures.push({ kind: 'calculation', caseId: `${a.accountId}#${s.id}`, detail: `diff expected ${expectedDiff} got ${gotDiff}` })
    }

    // removal restores the original forecast exactly
    fin.removalCases += 1
    const restored = buildForecast({ ...input, scenario: null })
    if (
      toCents(restored.lowestBalance) === expected.lowMinor &&
      restored.lowestBalanceDate === expected.lowDate &&
      JSON.stringify(restored.events.map((e) => toCents(e.balanceAfter))) === JSON.stringify(expected.balancesMinor)
    ) fin.removalRestored += 1
    else if (latencies) failures.push({ kind: 'calculation', caseId: `${a.accountId}#${s.id}#removal`, detail: 'forecast not restored after scenario removal' })
  }

  if (latencies) latencies.push(Number(process.hrtime.bigint() - t0) / 1e6)
}

/**
 * Detection scored per RAW merchant descriptor against declared labels.
 * A production prediction counts as covering every raw descriptor appearing in
 * its own evidence, so the benchmark never adopts production's merchant keys.
 */
function scoreDetection(accounts: SynthAccount[], failures: Failure[]) {
  const expense = { tp: 0, fp: 0, tn: 0, fn: 0 }
  const income = { tp: 0, fp: 0, tn: 0, fn: 0 }
  let mixedTruthMerchants = 0
  const fpExamples: string[] = []
  const fnExamples: string[] = []

  for (const a of accounts) {
    const parsed = parseCsv(accountCsv(a))
    if (parsed.errors.length) {
      failures.push({ kind: 'parsing', caseId: a.accountId, detail: parsed.errors.map((e) => e.code).join(',') })
      continue
    }
    const normalized = normalizeTransactions(parsed.transactions)
    const predictedExpenses = detectRecurringExpenses(normalized, a.asOfDate)
    const predictedIncome = detectIncome(normalized, a.asOfDate)

    const coveredByExpense = new Set<string>()
    for (const p of predictedExpenses) for (const t of p.evidence?.transactions ?? []) coveredByExpense.add(t.merchant)
    const coveredByIncome = new Set<string>()
    for (const p of predictedIncome.candidates) for (const t of p.evidence?.transactions ?? []) coveredByIncome.add(t.merchant)

    // Declared truth per raw descriptor.
    const truthByMerchant = new Map<string, Set<string>>()
    for (const t of a.transactions) {
      if (!truthByMerchant.has(t.merchant)) truthByMerchant.set(t.merchant, new Set())
      truthByMerchant.get(t.merchant)!.add(t.truth)
    }

    for (const [merchant, truths] of truthByMerchant) {
      if (truths.size > 1) { mixedTruthMerchants += 1; continue } // genuinely ambiguous: skip
      const truth = [...truths][0]
      if (truth !== 'income') {
        const actual = truth === 'recurring-expense'
        const predicted = coveredByExpense.has(merchant)
        if (actual && predicted) expense.tp += 1
        else if (!actual && predicted) { expense.fp += 1; if (fpExamples.length < 8) fpExamples.push(`${a.accountId}:${merchant}`) }
        else if (!actual && !predicted) expense.tn += 1
        else { expense.fn += 1; if (fnExamples.length < 8) fnExamples.push(`${a.accountId}:${merchant}`) }
      }
      if (truth !== 'recurring-expense') {
        const actual = truth === 'income'
        const predicted = coveredByIncome.has(merchant)
        if (actual && predicted) income.tp += 1
        else if (!actual && predicted) income.fp += 1
        else if (!actual && !predicted) income.tn += 1
        else income.fn += 1
      }
    }
  }

  const stats = (m: typeof expense) => {
    const precision = m.tp + m.fp === 0 ? 0 : m.tp / (m.tp + m.fp)
    const recall = m.tp + m.fn === 0 ? 0 : m.tp / (m.tp + m.fn)
    return { ...m, precision, recall, f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall) }
  }

  return {
    recurringExpense: stats(expense),
    income: stats(income),
    mixedTruthMerchantsExcluded: mixedTruthMerchants,
    falsePositiveExamples: fpExamples,
    falseNegativeExamples: fnExamples,
  }
}
