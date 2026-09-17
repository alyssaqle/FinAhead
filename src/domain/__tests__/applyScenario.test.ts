import { describe, expect, it } from 'vitest'
import { applyScenario, validateScenario } from '../applyScenario'
import { buildForecast, type ForecastInput } from '../buildForecast'
import { expense, income } from './testHelpers'

const AS_OF = '2026-09-16'

const baseInput: ForecastInput = {
  currentBalance: 2140,
  asOfDate: AS_OF,
  predictions: [
    expense('Rent', '2026-09-22', 1150),
    expense('Loan', '2026-09-25', 145),
    income('Payroll', '2026-09-29', 1412.55),
  ],
}

describe('applyScenario', () => {
  it('lowers the projected low point by the purchase amount', () => {
    const { errors, comparison } = applyScenario(baseInput, {
      amount: 350,
      date: '2026-09-18',
      label: 'Trip',
    })

    expect(errors).toEqual([])
    expect(comparison?.baseline.lowestBalance).toBe(845)
    expect(comparison?.projected.lowestBalance).toBe(495)
    expect(comparison?.difference).toBe(-350)
    expect(comparison?.projected.lowestBalanceDate).toBe('2026-09-25')
    expect(comparison?.goesBelowZero).toBe(false)
  })

  it('treats the entered amount as an outflow and labels the timeline row', () => {
    const { comparison } = applyScenario(baseInput, {
      amount: 350,
      date: '2026-09-18',
      label: 'Trip',
    })

    const scenarioEvent = comparison?.projected.events.find(
      (event) => event.source === 'scenario',
    )

    expect(scenarioEvent).toMatchObject({
      amount: -350,
      kind: 'expense',
      isPrediction: false,
      label: 'Trip (what-if)',
      balanceAfter: 1790,
    })
  })

  it('places the scenario in date order within the timeline', () => {
    const { comparison } = applyScenario(baseInput, {
      amount: 350,
      date: '2026-09-24',
    })

    expect(comparison?.projected.events.map((event) => event.label)).toEqual([
      'Rent',
      'Hypothetical purchase (what-if)',
      'Loan',
      'Payroll',
    ])
  })

  it('allows a purchase dated today', () => {
    const { errors, comparison } = applyScenario(baseInput, {
      amount: 100,
      date: AS_OF,
    })

    expect(errors).toEqual([])
    expect(comparison?.projected.events[0].date).toBe(AS_OF)
  })

  it('rejects a zero amount', () => {
    const { errors, comparison } = applyScenario(baseInput, {
      amount: 0,
      date: '2026-09-18',
    })

    expect(comparison).toBeNull()
    expect(errors[0]).toMatchObject({ field: 'amount', code: 'zero-amount' })
  })

  it('rejects a nonnumeric amount', () => {
    const { errors } = applyScenario(baseInput, {
      amount: Number.NaN,
      date: '2026-09-18',
    })

    expect(errors[0].code).toBe('invalid-amount')
  })

  it('asks for a positive number rather than silently flipping the sign', () => {
    const { errors } = applyScenario(baseInput, {
      amount: -350,
      date: '2026-09-18',
    })

    expect(errors[0].code).toBe('negative-amount')
  })

  it('rejects a date after the end of the forecast', () => {
    const { errors, comparison } = applyScenario(baseInput, {
      amount: 350,
      date: '2026-10-15',
    })

    expect(comparison).toBeNull()
    expect(errors[0].code).toBe('date-outside-forecast')
    expect(errors[0].message).toContain('Sep 29, 2026')
  })

  it('rejects a date before the as-of date', () => {
    const { errors } = applyScenario(baseInput, {
      amount: 350,
      date: '2026-09-10',
    })

    expect(errors[0].code).toBe('date-in-past')
  })

  it('rejects an invalid date', () => {
    const { errors } = applyScenario(baseInput, { amount: 350, date: '' })

    expect(errors[0].code).toBe('invalid-date')
  })

  it('warns when the scenario pushes the balance below zero', () => {
    const { comparison } = applyScenario(
      { ...baseInput, currentBalance: 1400 },
      { amount: 350, date: '2026-09-18' },
    )

    expect(comparison?.projected.lowestBalance).toBe(-245)
    expect(comparison?.goesBelowZero).toBe(true)
    expect(
      comparison?.projected.warnings.map((warning) => warning.code),
    ).toContain('scenario-below-zero')
  })

  it('does not blame the scenario when the baseline was already negative', () => {
    const { comparison } = applyScenario(
      { ...baseInput, currentBalance: 1000 },
      { amount: 50, date: '2026-09-18' },
    )

    expect(comparison?.baseline.lowestBalance).toBeLessThan(0)
    expect(
      comparison?.projected.warnings.map((warning) => warning.code),
    ).not.toContain('scenario-below-zero')
    expect(comparison?.goesBelowZero).toBe(true)
  })

  it('applies a scenario that lands on the same date as another event', () => {
    const { comparison } = applyScenario(baseInput, {
      amount: 200,
      date: '2026-09-22',
    })

    const sameDay = comparison?.projected.events.filter(
      (event) => event.date === '2026-09-22',
    )

    // Same-day expenses are ordered largest outflow first, and both are applied
    // before the day is over, so the end-of-day balance is unambiguous.
    expect(sameDay?.map((event) => event.label)).toEqual([
      'Rent',
      'Hypothetical purchase (what-if)',
    ])
    expect(sameDay?.[1].balanceAfter).toBe(790)
    expect(comparison?.difference).toBe(-200)
  })

  it('works when the scenario lands on the same date as income', () => {
    const { comparison } = applyScenario(baseInput, {
      amount: 100,
      date: '2026-09-29',
    })

    expect(comparison?.projected.events.map((event) => event.label)).toEqual([
      'Rent',
      'Loan',
      'Hypothetical purchase (what-if)',
      'Payroll',
    ])
    // The purchase lands before payday on that date, so it moves the low point.
    expect(comparison?.difference).toBe(-100)
  })

  it('leaves the baseline forecast untouched', () => {
    const before = buildForecast(baseInput)
    applyScenario(baseInput, { amount: 350, date: '2026-09-18' })
    const after = buildForecast(baseInput)

    expect(after).toEqual(before)
  })

  it('answers the $350 trip question end to end', () => {
    const { comparison } = applyScenario(baseInput, {
      amount: 350,
      date: '2026-09-19',
      label: 'Weekend trip',
    })

    expect(comparison?.baseline.lowestBalance).toBe(845)
    expect(comparison?.projected.lowestBalance).toBe(495)
    expect(comparison?.projected.lowestBalanceDate).toBe('2026-09-25')
  })
})

describe('validateScenario', () => {
  it('reports every problem at once', () => {
    const baseline = buildForecast(baseInput)
    const errors = validateScenario({ amount: 0, date: 'nope' }, baseline)

    expect(errors.map((error) => error.field).sort()).toEqual(['amount', 'date'])
  })
})
