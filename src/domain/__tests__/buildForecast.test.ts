import { describe, expect, it } from 'vitest'
import { buildForecast, resolvePredictions } from '../buildForecast'
import { projectNextDate } from '../recurrence'
import { expense, income } from './testHelpers'

const AS_OF = '2026-09-16'

describe('buildForecast', () => {
  it('produces a correct running balance in chronological order', () => {
    const forecast = buildForecast({
      currentBalance: 2140,
      asOfDate: AS_OF,
      predictions: [
        expense('Spotify', '2026-09-22', 11.99),
        expense('Rent', '2026-09-18', 1150),
        income('Payroll', '2026-09-29', 1412.55),
      ],
    })

    expect(forecast.events.map((event) => [event.date, event.balanceAfter])).toEqual([
      ['2026-09-18', 990],
      ['2026-09-22', 978.01],
      ['2026-09-29', 2390.56],
    ])
  })

  it('reports the lowest balance before the next income deposit', () => {
    const forecast = buildForecast({
      currentBalance: 2140,
      asOfDate: AS_OF,
      predictions: [
        expense('Rent', '2026-09-18', 1150),
        expense('Loan', '2026-09-25', 145),
        income('Payroll', '2026-09-29', 1412.55),
        // Falls after payday, so it must not affect the low point.
        expense('Gym', '2026-10-02', 500),
      ],
    })

    expect(forecast.lowestBalance).toBe(845)
    expect(forecast.lowestBalanceDate).toBe('2026-09-25')
    expect(forecast.lowPointEventId).toBe('expense:loan')
    expect(forecast.nextIncome?.date).toBe('2026-09-29')
    // The horizon is payday, so the later expense is not in the timeline at all.
    expect(forecast.events).toHaveLength(3)
    expect(forecast.horizonDate).toBe('2026-09-29')
  })

  it('applies expenses before income on the same date', () => {
    const forecast = buildForecast({
      currentBalance: 500,
      asOfDate: AS_OF,
      predictions: [
        income('Payroll', '2026-09-20', 1412.55),
        expense('Rent', '2026-09-20', 1150),
      ],
    })

    expect(forecast.events.map((event) => event.label)).toEqual(['Rent', 'Payroll'])
    // The dip is visible even though the deposit lands the same day.
    expect(forecast.lowestBalance).toBe(-650)
    expect(forecast.lowestBalanceDate).toBe('2026-09-20')
    expect(forecast.events[1].balanceAfter).toBe(762.55)
  })

  it('orders several same-day expenses largest outflow first', () => {
    const forecast = buildForecast({
      currentBalance: 1000,
      asOfDate: AS_OF,
      predictions: [
        expense('Small', '2026-09-20', 10),
        expense('Large', '2026-09-20', 400),
        expense('Medium', '2026-09-20', 100),
      ],
    })

    expect(forecast.events.map((event) => event.label)).toEqual([
      'Large',
      'Medium',
      'Small',
    ])
    expect(forecast.events.map((event) => event.balanceAfter)).toEqual([600, 500, 490])
  })

  it('handles month-end dates without skipping a month', () => {
    // A bill on the 31st lands on the 28th in February, not on March 3rd.
    expect(projectNextDate('2026-01-31', 'monthly', 31, '2026-02-01')).toBe(
      '2026-02-28',
    )

    const forecast = buildForecast({
      currentBalance: 1000,
      asOfDate: '2026-01-31',
      predictions: [
        expense('Rent', '2026-02-28', 900),
        income('Payroll', '2026-03-02', 1500),
      ],
    })

    expect(forecast.lowestBalance).toBe(100)
    expect(forecast.lowestBalanceDate).toBe('2026-02-28')
  })

  it('uses the current balance as the low point when nothing is scheduled', () => {
    const forecast = buildForecast({
      currentBalance: 2140,
      asOfDate: AS_OF,
      predictions: [income('Payroll', '2026-09-29', 1412.55)],
    })

    expect(forecast.events).toHaveLength(1)
    expect(forecast.lowestBalance).toBe(2140)
    expect(forecast.lowestBalanceDate).toBe(AS_OF)
    expect(forecast.lowPointEventId).toBeNull()
    expect(
      forecast.warnings.map((warning) => warning.code),
    ).toContain('no-recurring-expenses')
  })

  it('warns when the projected balance goes below zero', () => {
    const forecast = buildForecast({
      currentBalance: 300,
      asOfDate: AS_OF,
      predictions: [
        expense('Rent', '2026-09-18', 1150),
        income('Payroll', '2026-09-29', 1412.55),
      ],
    })

    expect(forecast.lowestBalance).toBe(-850)
    expect(forecast.warnings.map((warning) => warning.code)).toContain(
      'negative-balance',
    )
  })

  it('excludes events dated on or before the as-of date', () => {
    const forecast = buildForecast({
      currentBalance: 2140,
      asOfDate: AS_OF,
      predictions: [
        expense('Already paid', AS_OF, 100),
        expense('Yesterday', '2026-09-15', 100),
        expense('Tomorrow', '2026-09-17', 100),
        income('Payroll', '2026-09-29', 1412.55),
      ],
    })

    expect(forecast.events.map((event) => event.label)).toEqual([
      'Tomorrow',
      'Payroll',
    ])
  })

  it('recalculates after a prediction is edited', () => {
    const predictions = [
      expense('Rent', '2026-09-18', 1150),
      income('Payroll', '2026-09-29', 1412.55),
    ]

    const edited = buildForecast({
      currentBalance: 2140,
      asOfDate: AS_OF,
      predictions,
      edits: { 'expense:rent': { amount: 1300, date: '2026-09-20' } },
    })

    expect(edited.events[0]).toMatchObject({
      date: '2026-09-20',
      amount: -1300,
      balanceAfter: 840,
    })
    expect(edited.lowestBalance).toBe(840)
    expect(edited.lowestBalanceDate).toBe('2026-09-20')
  })

  it('keeps an expense an outflow even if the edit supplies a positive amount', () => {
    const forecast = buildForecast({
      currentBalance: 2140,
      asOfDate: AS_OF,
      predictions: [expense('Rent', '2026-09-18', 1150)],
      edits: { 'expense:rent': { amount: 1200 } },
    })

    expect(forecast.events[0].amount).toBe(-1200)
  })

  it('recalculates after a prediction is marked not recurring', () => {
    const forecast = buildForecast({
      currentBalance: 2140,
      asOfDate: AS_OF,
      predictions: [
        expense('Rent', '2026-09-18', 1150),
        expense('Gym', '2026-09-20', 24.99),
        income('Payroll', '2026-09-29', 1412.55),
      ],
      rejectedIds: ['expense:gym'],
    })

    expect(forecast.events.map((event) => event.label)).toEqual(['Rent', 'Payroll'])
    expect(forecast.lowestBalance).toBe(990)
    expect(forecast.missingAssumptions.join(' ')).toContain('not recurring')
  })

  it('promotes the next remaining income when the primary one is rejected', () => {
    const forecast = buildForecast({
      currentBalance: 2140,
      asOfDate: AS_OF,
      predictions: [
        income('Payroll', '2026-09-29', 1412.55, true),
        income('Stipend', '2026-09-24', 300, false),
      ],
      rejectedIds: ['income:payroll'],
    })

    expect(forecast.nextIncome?.label).toBe('Stipend')
    expect(forecast.horizonDate).toBe('2026-09-24')
  })

  it('falls back to a fixed window and warns when no income is known', () => {
    const forecast = buildForecast({
      currentBalance: 2140,
      asOfDate: AS_OF,
      predictions: [
        expense('Rent', '2026-10-01', 1150),
        expense('Far away', '2026-11-01', 999),
      ],
    })

    expect(forecast.nextIncome).toBeNull()
    expect(forecast.horizonDate).toBe('2026-10-21')
    expect(forecast.events.map((event) => event.label)).toEqual(['Rent'])
    expect(forecast.lowestBalance).toBe(990)
    expect(forecast.warnings.map((warning) => warning.code)).toContain(
      'no-income-detected',
    )
    expect(forecast.missingAssumptions.join(' ')).toContain('No income deposit')
  })

  it('uses a manually entered income deposit as the horizon', () => {
    const forecast = buildForecast({
      currentBalance: 2140,
      asOfDate: AS_OF,
      predictions: [
        expense('Rent', '2026-10-01', 1150),
        {
          ...income('Expected income (entered by you)', '2026-10-03', 1500),
          id: 'income:manual',
          source: 'user-manual',
        },
      ],
    })

    expect(forecast.horizonDate).toBe('2026-10-03')
    expect(forecast.lowestBalance).toBe(990)
    expect(forecast.warnings.map((warning) => warning.code)).not.toContain(
      'no-income-detected',
    )
  })

  it('is deterministic regardless of the order predictions are supplied in', () => {
    const predictions = [
      expense('Rent', '2026-09-18', 1150),
      expense('Gym', '2026-09-18', 24.99),
      income('Payroll', '2026-09-29', 1412.55),
    ]

    const forward = buildForecast({
      currentBalance: 2140,
      asOfDate: AS_OF,
      predictions,
    })
    const reversed = buildForecast({
      currentBalance: 2140,
      asOfDate: AS_OF,
      predictions: [...predictions].reverse(),
    })

    expect(forward.events).toEqual(reversed.events)
    expect(forward.lowestBalance).toBe(reversed.lowestBalance)
  })
})

describe('resolvePredictions', () => {
  it('marks an edited prediction so the UI can show it was corrected', () => {
    const [resolved] = resolvePredictions(
      [expense('Rent', '2026-09-18', 1150)],
      { 'expense:rent': { amount: 1200 } },
    )

    expect(resolved.source).toBe('user-edited')
  })

  it('leaves untouched predictions alone', () => {
    const original = expense('Rent', '2026-09-18', 1150)

    expect(resolvePredictions([original], {}, [])[0]).toBe(original)
  })

  it('removes rejected predictions', () => {
    const resolved = resolvePredictions(
      [expense('Rent', '2026-09-18', 1150), expense('Gym', '2026-09-20', 25)],
      {},
      ['expense:gym'],
    )

    expect(resolved.map((prediction) => prediction.displayName)).toEqual(['Rent'])
  })
})
