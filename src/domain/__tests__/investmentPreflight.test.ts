/**
 * Investment Preflight.
 *
 * The feature adds no forecasting of its own: a hypothetical investment is the
 * same cash event as a hypothetical purchase, so these tests mostly assert that
 * it goes through the existing engine unchanged, and that the hypothetical
 * value stress test stays entirely out of the cash timeline.
 */

import { describe, expect, it } from 'vitest'
import { applyScenario } from '../applyScenario'
import { buildForecast, type ForecastInput } from '../buildForecast'
import { buildRunwaySeries } from '../buildRunwaySeries'
import {
  buildStressTable,
  describeStressTable,
  STRESS_CHANGES,
} from '../investmentStress'
import type { Scenario } from '../types'
import { expense, income } from './testHelpers'

const AS_OF = '2026-09-16'

/** Low point is $585.01 on Sep 28, mirroring the demo account's shape. */
const input: ForecastInput = {
  currentBalance: 2140,
  asOfDate: AS_OF,
  predictions: [
    expense('Rent', '2026-09-20', 1150),
    expense('Card', '2026-09-22', 259.99),
    expense('Loan', '2026-09-28', 145),
    income('Payroll', '2026-09-29', 1412.55),
  ],
}

const investment = (overrides: Partial<Scenario> = {}): Scenario => ({
  amount: 200,
  date: '2026-09-18',
  kind: 'investment',
  category: 'etf',
  ...overrides,
})

describe('cash behaviour', () => {
  it('leaves the forecast untouched when there is no investment', () => {
    const before = buildForecast(input)
    applyScenario(input, investment())
    const after = buildForecast(input)

    expect(after).toEqual(before)
    expect(after.lowestBalance).toBe(585.01)
  })

  it('derives the comparison from the original forecast output', () => {
    const { comparison } = applyScenario(input, investment())

    expect(comparison?.baseline).toEqual(buildForecast(input))
    expect(comparison?.baseline.lowestBalance).toBe(585.01)
  })

  it('reduces every later running balance by exactly the amount invested', () => {
    const baseline = buildForecast(input)
    const { comparison } = applyScenario(input, investment({ amount: 200 }))
    const projected = comparison!.projected

    for (const base of baseline.events) {
      const after = projected.events.find((event) => event.id === base.id)!
      // Every event after the investment date drops by exactly $200.
      expect(after.balanceAfter).toBe(
        base.date >= '2026-09-18' ? base.balanceAfter - 200 : base.balanceAfter,
      )
    }
  })

  it('takes the projected low from the shared forecast calculation', () => {
    const { comparison } = applyScenario(input, investment({ amount: 200 }))
    const projected = comparison!.projected

    // Recomputed here from the engine's own timeline, not asserted as a constant.
    const windowEvents = projected.events.slice(
      0,
      projected.events.findIndex((event) => event.isPrimaryIncome),
    )
    const expectedLow = Math.min(
      projected.startingBalance,
      ...windowEvents.map((event) => event.balanceAfter),
    )

    expect(projected.lowestBalance).toBe(expectedLow)
    expect(projected.lowestBalance).toBe(385.01)
    expect(comparison!.difference).toBe(-200)
  })

  it('does not move the low by the full amount when invested after the low point', () => {
    /*
     * The balance dips to $100 on the 20th, recovers on a secondary deposit,
     * then the investment lands on the 25th. Because the dip already happened,
     * an $850 investment moves the projected low by $50, not by $850.
     */
    const dipThenRecover: ForecastInput = {
      currentBalance: 1000,
      asOfDate: AS_OF,
      predictions: [
        expense('Rent', '2026-09-20', 900),
        income('Side gig', '2026-09-22', 800, false),
        income('Payroll', '2026-09-29', 1000, true),
      ],
    }

    const baseline = buildForecast(dipThenRecover)
    expect(baseline.lowestBalance).toBe(100)
    expect(baseline.lowestBalanceDate).toBe('2026-09-20')

    const { comparison } = applyScenario(
      dipThenRecover,
      investment({ amount: 850, date: '2026-09-25' }),
    )

    expect(comparison!.projected.lowestBalance).toBe(50)
    expect(comparison!.difference).toBe(-50)
    expect(comparison!.difference).not.toBe(-850)
  })

  it('leaves the low untouched when the investment never dips below it', () => {
    const dipThenRecover: ForecastInput = {
      currentBalance: 1000,
      asOfDate: AS_OF,
      predictions: [
        expense('Rent', '2026-09-20', 900),
        income('Side gig', '2026-09-22', 800, false),
        income('Payroll', '2026-09-29', 1000, true),
      ],
    }

    const { comparison } = applyScenario(
      dipThenRecover,
      investment({ amount: 50, date: '2026-09-25' }),
    )

    expect(comparison!.baseline.lowestBalance).toBe(100)
    expect(comparison!.projected.lowestBalance).toBe(100)
    expect(comparison!.difference).toBe(0)
  })

  it('follows the existing same-date ordering rule', () => {
    const { comparison } = applyScenario(
      input,
      investment({ amount: 200, date: '2026-09-20' }),
    )
    const sameDay = comparison!.projected.events.filter(
      (event) => event.date === '2026-09-20',
    )

    // Same-day expenses order largest outflow first, then by id.
    expect(sameDay.map((event) => event.label)).toEqual([
      'Rent',
      'Hypothetical investment',
    ])
    expect(sameDay[1].balanceAfter).toBe(790)
  })

  it('warns and crosses zero when the cash balance goes negative', () => {
    // A balance where the forecast alone stays positive, so the warning is
    // attributable to the investment rather than to the existing obligations.
    const { comparison } = applyScenario(
      { ...input, currentBalance: 1600 },
      investment({ amount: 200 }),
    )

    expect(comparison!.baseline.lowestBalance).toBeGreaterThan(0)
    expect(comparison!.projected.lowestBalance).toBeLessThan(0)
    expect(comparison!.goesBelowZero).toBe(true)
    expect(
      comparison!.projected.warnings.map((warning) => warning.code),
    ).toContain('scenario-below-zero')
    expect(buildRunwaySeries(comparison!.projected).hasNegative).toBe(true)
  })

  it('recalculates when the amount or date is edited', () => {
    const first = applyScenario(input, investment({ amount: 200 }))
    const edited = applyScenario(input, investment({ amount: 350 }))
    const moved = applyScenario(
      input,
      investment({ amount: 200, date: '2026-09-25' }),
    )

    expect(first.comparison!.difference).toBe(-200)
    expect(edited.comparison!.difference).toBe(-350)
    expect(moved.comparison!.projected.events.find((e) => e.source === 'scenario')!.date)
      .toBe('2026-09-25')
  })

  it('restores the original forecast when the investment is removed', () => {
    const before = buildForecast(input)
    applyScenario(input, investment())
    const afterRemoval = buildForecast({ ...input, scenario: null })

    expect(afterRemoval).toEqual(before)
    expect(afterRemoval.lowestBalance).toBe(585.01)
  })

  it('validates like any other scenario', () => {
    expect(applyScenario(input, investment({ amount: 0 })).errors[0].code).toBe(
      'zero-amount',
    )
    expect(
      applyScenario(input, investment({ date: '2026-12-01' })).errors[0].code,
    ).toBe('date-outside-forecast')
  })

  it('ignores the category in every calculation', () => {
    const categories = ['stock', 'etf', 'crypto', 'other'] as const
    const results = categories.map(
      (category) =>
        applyScenario(input, investment({ category })).comparison!.projected
          .lowestBalance,
    )

    expect(new Set(results).size).toBe(1)
  })
})

describe('chart point', () => {
  it('labels the investment point accessibly with date, amount, category and balance', () => {
    const { comparison } = applyScenario(input, investment({ category: 'crypto' }))
    const series = buildRunwaySeries(comparison!.projected)
    const point = series.points.find((candidate) => candidate.isScenario)!

    expect(point.scenarioKind).toBe('investment')
    expect(point.scenarioCategory).toBe('crypto')
    expect(point.label).toBe('Hypothetical investment')
    expect(point.headline).toBe('Cash balance after this investment')
    expect(point.description).toBe(
      'Sep 18, 2026, hypothetical crypto investment of negative $200.00. Resulting cash balance $1,940.00.',
    )
  })

  it('keeps an optional label in the event name', () => {
    const { comparison } = applyScenario(
      input,
      investment({ label: 'Index fund' }),
    )
    const point = buildRunwaySeries(comparison!.projected).points.find(
      (candidate) => candidate.isScenario,
    )!

    expect(point.label).toBe('Index fund (hypothetical investment)')
  })

  it('leaves purchase scenarios described exactly as before', () => {
    const { comparison } = applyScenario(input, {
      amount: 200,
      date: '2026-09-18',
      label: 'Trip',
    })
    const point = buildRunwaySeries(comparison!.projected).points.find(
      (candidate) => candidate.isScenario,
    )!

    expect(point.label).toBe('Trip (what-if)')
    expect(point.headline).toBe('Balance after this purchase')
    expect(point.scenarioKind).toBeUndefined()
  })
})

describe('hypothetical value stress test', () => {
  it('offers no change, and 10, 25 and 50 percent declines', () => {
    expect(STRESS_CHANGES).toEqual([0, -0.1, -0.25, -0.5])
    expect(buildStressTable(200).map((row) => row.label)).toEqual([
      'No change',
      '10% decline',
      '25% decline',
      '50% decline',
    ])
  })

  it('calculates each level to the cent', () => {
    expect(buildStressTable(200).map((row) => row.value)).toEqual([200, 180, 150, 100])
    expect(buildStressTable(50).map((row) => row.value)).toEqual([50, 45, 37.5, 25])
    expect(buildStressTable(333.33).map((row) => row.value)).toEqual([
      333.33, 300, 250, 166.67,
    ])
  })

  it('reports the difference from the amount invested', () => {
    expect(buildStressTable(200).map((row) => row.difference)).toEqual([
      0, -20, -50, -100,
    ])
  })

  it('rounds half away from zero at the cent', () => {
    // 5 cents at 50% is exactly half a cent.
    expect(buildStressTable(0.05).map((row) => row.value)).toEqual([
      0.05, 0.05, 0.04, 0.03,
    ])
  })

  it('treats the amount as a magnitude', () => {
    expect(buildStressTable(-200).map((row) => row.value)).toEqual([
      200, 180, 150, 100,
    ])
  })

  it('never returns negative zero', () => {
    expect(Object.is(buildStressTable(0)[3].value, 0)).toBe(true)
  })

  it('does not touch the cash timeline', () => {
    const { comparison } = applyScenario(input, investment({ amount: 200 }))
    const before = comparison!.projected

    buildStressTable(200)
    const after = applyScenario(input, investment({ amount: 200 })).comparison!
      .projected

    // A decline in hypothetical value puts no money back into the account and
    // takes none out: the cash timeline is identical either way.
    expect(after).toEqual(before)
    expect(after.lowestBalance).toBe(385.01)
  })

  it('summarises every level for assistive technology', () => {
    const rows = buildStressTable(200)
    const summary = describeStressTable(200, rows)

    for (const row of rows) {
      expect(summary).toContain(row.label)
    }
    expect(summary).toContain('$100.00')
    expect(summary).toContain('not predictions')
  })
})
