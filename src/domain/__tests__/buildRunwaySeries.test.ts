/**
 * The chart's data transform.
 *
 * These pin the property the visualisation depends on: every point is read
 * from the forecast engine's output, so the chart and the timeline beside it
 * cannot disagree.
 */

import { describe, expect, it } from 'vitest'
import { buildRunwaySeries, combineScale } from '../buildRunwaySeries'
import { buildForecast } from '../buildForecast'
import { applyScenario } from '../applyScenario'
import { buildDemoForecast } from '../../data/demoForecast'
import { expense, income } from './testHelpers'

const AS_OF = '2026-09-16'

const input = {
  currentBalance: 2140,
  asOfDate: AS_OF,
  predictions: [
    expense('Rent', '2026-09-20', 1150),
    expense('Loan', '2026-09-28', 145),
    income('Payroll', '2026-09-29', 1412.55),
  ],
}

describe('buildRunwaySeries', () => {
  it('opens on today and then follows the forecast events in order', () => {
    const series = buildRunwaySeries(buildForecast(input))

    expect(series.points).toHaveLength(4)
    expect(series.points[0]).toMatchObject({
      label: 'Balance today',
      date: AS_OF,
      balance: 2140,
      amount: null,
      kind: 'start',
    })
    expect(series.points.map((point) => point.date)).toEqual([
      '2026-09-16',
      '2026-09-20',
      '2026-09-28',
      '2026-09-29',
    ])
  })

  it('takes every balance from the forecast rather than recomputing it', () => {
    const forecast = buildForecast(input)
    const series = buildRunwaySeries(forecast)

    expect(series.points[0].balance).toBe(forecast.startingBalance)
    forecast.events.forEach((event, index) => {
      expect(series.points[index + 1].balance).toBe(event.balanceAfter)
      expect(series.points[index + 1].amount).toBe(event.amount)
    })
  })

  it('marks the projected low and the payday from the forecast', () => {
    const forecast = buildForecast(input)
    const series = buildRunwaySeries(forecast)

    expect(series.points[series.lowIndex].balance).toBe(forecast.lowestBalance)
    expect(series.points[series.lowIndex].date).toBe(forecast.lowestBalanceDate)
    expect(series.paydayIndex).toBe(3)
    expect(series.points[3].isPayday).toBe(true)
  })

  it('points at today when nothing is scheduled before payday', () => {
    const series = buildRunwaySeries(
      buildForecast({
        currentBalance: 2140,
        asOfDate: AS_OF,
        predictions: [income('Payroll', '2026-09-29', 1412.55)],
      }),
    )

    expect(series.lowIndex).toBe(0)
    expect(series.points[0].isLowPoint).toBe(true)
  })

  it('flags a scenario point and reports a negative run', () => {
    const { comparison } = applyScenario(
      { ...input, currentBalance: 1200 },
      { amount: 350, date: '2026-09-18', label: 'Trip' },
    )
    const series = buildRunwaySeries(comparison!.projected)
    const scenarioPoint = series.points.find((point) => point.isScenario)

    expect(scenarioPoint).toMatchObject({ amount: -350, isPrediction: false })
    expect(scenarioPoint!.headline).toBe('Balance after this purchase')
    expect(series.hasNegative).toBe(true)
    expect(series.min).toBeLessThan(0)
  })

  it('writes a spoken description carrying date, event, amount and balance', () => {
    const series = buildRunwaySeries(buildForecast(input))

    expect(series.points[1].description).toBe(
      'Sep 20, 2026, predicted Rent payment of negative $1,150.00. Resulting balance $990.00.',
    )
    expect(series.points[3].description).toContain('positive $1,412.55')
    expect(series.points[3].description).toContain('Resulting balance $2,257.55.')
  })

  it('builds headline and detail copy for each point', () => {
    const series = buildRunwaySeries(buildForecast(input))

    expect(series.points[1].headline).toBe('Balance after Rent')
    expect(series.points[1].detail).toBe('Sep 20, 2026 · Rent −$1,150.00')
    expect(series.points[3].headline).toBe('Balance after expected income')
    expect(series.points[3].detail).toBe('Sep 29, 2026 · Payroll +$1,412.55')
  })

  it('falls back to a generic headline for a long merchant name', () => {
    const series = buildRunwaySeries(
      buildForecast({
        ...input,
        predictions: [expense('Cedar Ridge Apartments Rent', '2026-09-20', 1150)],
      }),
    )

    expect(series.points[1].headline).toBe('Balance after this payment')
  })
})

describe('combineScale', () => {
  it('spans every series so a comparison shares one vertical scale', () => {
    const baseline = buildRunwaySeries(buildForecast(input))
    const { comparison } = applyScenario(input, {
      amount: 350,
      date: '2026-09-18',
    })
    const projected = buildRunwaySeries(comparison!.projected)
    const scale = combineScale(baseline, projected)

    expect(scale.min).toBe(Math.min(baseline.min, projected.min))
    expect(scale.max).toBe(Math.max(baseline.max, projected.max))
  })

  it('always includes zero when any series goes below it', () => {
    const { comparison } = applyScenario(
      { ...input, currentBalance: 1200 },
      { amount: 350, date: '2026-09-18' },
    )
    const scale = combineScale(buildRunwaySeries(comparison!.projected))

    expect(scale.min).toBeLessThan(0)
    expect(scale.max).toBeGreaterThanOrEqual(0)
  })
})

describe('the sample preview is not hard-coded', () => {
  it('derives its figures from the demo pipeline', () => {
    const { forecast } = buildDemoForecast(AS_OF)
    const series = buildRunwaySeries(forecast)

    expect(series.points[0].balance).toBe(forecast.startingBalance)
    expect(series.points[series.lowIndex].balance).toBe(forecast.lowestBalance)
    expect(series.points).toHaveLength(forecast.events.length + 1)
    expect(series.paydayIndex).not.toBeNull()
  })

  it('agrees with the scenario the preview advertises', () => {
    const { input: demoInput, forecast } = buildDemoForecast(AS_OF)
    const { comparison } = applyScenario(demoInput, {
      amount: 350,
      date: '2026-09-17',
      label: 'Weekend trip',
    })

    expect(comparison!.baseline.lowestBalance).toBe(forecast.lowestBalance)
    expect(comparison!.difference).toBe(-350)
  })
})
