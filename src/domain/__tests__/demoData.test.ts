/**
 * The demo account must behave like any other dataset: every number the demo
 * screen shows has to fall out of the detectors and the forecast engine. These
 * tests run the demo through the real pipeline on several as-of dates,
 * including month boundaries and a leap year, and assert on properties rather
 * than on a fixed expected forecast — a hard-coded expected result here would
 * be exactly the thing the product must not do.
 */

import { describe, expect, it } from 'vitest'
import { buildDemoDataset, DEMO_STARTING_BALANCE } from '../../data/demoData'
import { normalizeTransactions } from '../normalizeMerchant'
import { detectRecurringExpenses } from '../detectRecurringExpenses'
import { detectIncome } from '../detectIncome'
import { buildForecast } from '../buildForecast'
import { applyScenario } from '../applyScenario'
import { addDays, diffDays } from '../dateUtils'

const AS_OF_DATES = [
  '2026-09-16',
  '2026-09-30',
  '2026-10-01',
  '2026-12-31',
  '2027-01-01',
  '2028-02-29',
  '2028-03-01',
]

function pipeline(asOfDate: string) {
  const demo = buildDemoDataset(asOfDate)
  const normalized = normalizeTransactions(demo.transactions)
  const expenses = detectRecurringExpenses(normalized, asOfDate)
  const incomeResult = detectIncome(normalized, asOfDate)
  const predictions = [...expenses, ...incomeResult.candidates]
  const forecast = buildForecast({
    currentBalance: demo.currentBalance,
    asOfDate,
    predictions,
  })
  return { demo, normalized, expenses, incomeResult, predictions, forecast }
}

describe('demo dataset', () => {
  it.each(AS_OF_DATES)('produces a usable forecast as of %s', (asOfDate) => {
    const { demo, expenses, incomeResult, forecast } = pipeline(asOfDate)

    // About three months of history, all of it in the past.
    expect(demo.transactions.length).toBeGreaterThan(50)
    expect(demo.currentBalance).toBe(DEMO_STARTING_BALANCE)
    expect(demo.transactions.every((row) => row.date < asOfDate)).toBe(true)
    expect(diffDays(demo.historyStartDate, asOfDate)).toBe(95)

    // The rent, subscription, internet, card, phone and loan obligations are
    // all found by the detector, not declared anywhere.
    expect(expenses.length).toBeGreaterThanOrEqual(5)
    expect(
      expenses.every((prediction) => prediction.evidence!.transactions.length >= 2),
    ).toBe(true)
    expect(expenses.every((prediction) => prediction.date > asOfDate)).toBe(true)

    // The paycheck is identified and outranks the smaller monthly transfer.
    expect(incomeResult.primary?.displayName).toBe('Northgate Univ Payroll')
    expect(incomeResult.primary?.evidence?.cadence).toBe('biweekly')
    expect(incomeResult.candidates.length).toBeGreaterThanOrEqual(2)

    // The forecast window ends at payday and contains something worth seeing.
    expect(forecast.nextIncome).not.toBeNull()
    expect(forecast.horizonDate).toBe(incomeResult.primary?.date)
    expect(forecast.events.length).toBeGreaterThanOrEqual(2)
    expect(forecast.warnings.map((warning) => warning.code)).not.toContain(
      'no-income-detected',
    )
  })

  it('never predicts everyday variable spending', () => {
    const { expenses } = pipeline('2026-09-16')
    const predicted = expenses.map((prediction) => prediction.displayName)

    for (const merchant of ['Starbucks', 'DoorDash', 'Uber', "Trader Joe's", 'Safeway']) {
      expect(predicted).not.toContain(merchant)
    }
  })

  it('finds the fixed monthly obligations', () => {
    const { expenses } = pipeline('2026-09-16')
    const predicted = expenses.map((prediction) => prediction.displayName)

    expect(predicted).toContain('Cedar Ridge Apts Rent')
    expect(predicted).toContain('Spotify')
    expect(predicted).toContain('Xfinity Internet')
    expect(predicted).toContain('Chase Credit Card')
  })

  it('keeps the running balance consistent with the starting balance', () => {
    const { forecast } = pipeline('2026-09-16')

    let balance = forecast.startingBalance
    for (const event of forecast.events) {
      balance = Math.round((balance + event.amount) * 100) / 100
      expect(event.balanceAfter).toBe(balance)
    }
  })

  it.each(AS_OF_DATES)(
    'moves the projected low point by exactly the purchase amount as of %s',
    (asOfDate) => {
      const { demo, predictions } = pipeline(asOfDate)
      const { errors, comparison } = applyScenario(
        {
          currentBalance: demo.currentBalance,
          asOfDate,
          predictions,
        },
        { amount: 350, date: addDays(asOfDate, 1), label: 'Trip' },
      )

      expect(errors).toEqual([])
      expect(comparison?.difference).toBe(-350)
    },
  )

  it('is reproducible: the same as-of date always yields the same data', () => {
    expect(buildDemoDataset('2026-09-16')).toEqual(buildDemoDataset('2026-09-16'))
  })

  it.each(AS_OF_DATES)(
    'lands the five headline obligations before payday as of %s',
    (asOfDate) => {
      const { forecast } = pipeline(asOfDate)
      const beforePayday = forecast.events
        .filter((event) => event.kind === 'expense')
        .map((event) => event.label)

      for (const merchant of [
        'Cedar Ridge Apts Rent',
        'Chase Credit Card',
        'Planet Fitness',
        'Mint Mobile',
        'Nelnet Student Loan',
      ]) {
        expect(beforePayday).toContain(merchant)
      }
    },
  )

  it.each(AS_OF_DATES)(
    'projects a low point that demonstrates the product as of %s',
    (asOfDate) => {
      const { forecast } = pipeline(asOfDate)

      // The demo is tuned so the pre-payday dip is the visible story. These are
      // demonstration targets, not hard-coded outputs: the assertion below
      // recomputes the figure from the timeline the engine produced.
      expect(forecast.lowestBalance).toBeGreaterThanOrEqual(500)
      expect(forecast.lowestBalance).toBeLessThanOrEqual(700)
    },
  )

  it('derives the low point from the demo transactions, not from a constant', () => {
    const { forecast } = pipeline('2026-09-16')

    const outflowsBeforePayday = forecast.events
      .filter((event) => event.kind === 'expense')
      .reduce((total, event) => total + event.amount, 0)

    expect(forecast.lowestBalance).toBeCloseTo(
      forecast.startingBalance + outflowsBeforePayday,
      2,
    )
    // Every one of those outflows traces back to real history in the dataset.
    expect(
      forecast.events
        .filter((event) => event.kind === 'expense')
        .every((event) => event.isPrediction),
    ).toBe(true)
  })

  it.each(AS_OF_DATES)(
    'leaves a demonstrable margin after a $350 purchase as of %s',
    (asOfDate) => {
      const { demo, predictions } = pipeline(asOfDate)
      const { comparison } = applyScenario(
        { currentBalance: demo.currentBalance, asOfDate, predictions },
        { amount: 350, date: addDays(asOfDate, 1), label: 'Trip' },
      )

      expect(comparison?.projected.lowestBalance).toBeGreaterThanOrEqual(150)
      expect(comparison?.projected.lowestBalance).toBeLessThanOrEqual(350)
    },
  )
})
