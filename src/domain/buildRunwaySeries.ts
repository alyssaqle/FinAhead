/**
 * Turns a ForecastResult into the points a cash-runway chart draws.
 *
 * This is a presentation transform, not a calculation. Every balance here is
 * read straight off the forecast engine's output — nothing is summed, rounded
 * or re-derived, so the chart cannot drift from the timeline beside it. If a
 * number is wrong on the chart, it is wrong in the forecast.
 *
 * The shape it describes is the product's whole idea: today, the obligations
 * that come off the balance, the low point, then payday.
 */

import type { ForecastResult } from './types'
import { formatCurrency } from './money'
import { formatDisplayDate } from './dateUtils'

export type RunwayPointKind = 'start' | 'expense' | 'income'

export interface RunwayPoint {
  id: string
  index: number
  date: string
  /** Event name, or "Balance today" for the opening point. */
  label: string
  /** Signed amount that moved the balance. Null for the opening point. */
  amount: number | null
  /** Running balance after this event, taken from the forecast. */
  balance: number
  kind: RunwayPointKind
  isPrediction: boolean
  isLowPoint: boolean
  isPayday: boolean
  isScenario: boolean
  /** Headline shown above the amount, e.g. "Balance after rent". */
  headline: string
  /** One-line description under the amount, e.g. "Sep 20 · Rent −$1,150.00". */
  detail: string
  /** Full sentence for assistive technology. */
  description: string
}

export interface RunwaySeries {
  points: RunwayPoint[]
  /** Index of the projected low point. Always valid; 0 means today. */
  lowIndex: number
  /** Index of the next expected income, or null when none was identified. */
  paydayIndex: number | null
  min: number
  max: number
  hasNegative: boolean
}

export interface RunwayScale {
  min: number
  max: number
}

/** Long merchant names make an unwieldy headline; fall back to a generic one. */
const MAX_HEADLINE_LABEL = 24

function headlineFor(
  kind: RunwayPointKind,
  label: string,
  isScenario: boolean,
): string {
  if (kind === 'start') return 'Balance today'
  if (isScenario) return 'Balance after this purchase'
  if (kind === 'income') return 'Balance after expected income'
  return label.length <= MAX_HEADLINE_LABEL
    ? `Balance after ${label}`
    : 'Balance after this payment'
}

/** "negative $1,150.00" reads correctly aloud; "-$1,150.00" may not. */
function spokenAmount(amount: number): string {
  return `${amount < 0 ? 'negative ' : 'positive '}${formatCurrency(Math.abs(amount))}`
}

function describe(
  date: string,
  label: string,
  amount: number,
  balance: number,
  kind: RunwayPointKind,
  isPrediction: boolean,
  isScenario: boolean,
): string {
  const nature = isScenario
    ? 'hypothetical'
    : isPrediction
      ? 'predicted'
      : 'expected'
  const movement = kind === 'income' ? 'deposit' : 'payment'
  return `${formatDisplayDate(date)}, ${nature} ${label} ${movement} of ${spokenAmount(
    amount,
  )}. Resulting balance ${formatCurrency(balance)}.`
}

export function buildRunwaySeries(forecast: ForecastResult): RunwaySeries {
  const start: RunwayPoint = {
    id: 'runway-start',
    index: 0,
    date: forecast.asOfDate,
    label: 'Balance today',
    amount: null,
    balance: forecast.startingBalance,
    kind: 'start',
    isPrediction: false,
    isLowPoint: forecast.lowPointEventId === null,
    isPayday: false,
    isScenario: false,
    headline: 'Balance today',
    detail: formatDisplayDate(forecast.asOfDate),
    description: `${formatDisplayDate(forecast.asOfDate)}, balance today, ${formatCurrency(
      forecast.startingBalance,
    )}.`,
  }

  const points: RunwayPoint[] = [
    start,
    ...forecast.events.map((event, position): RunwayPoint => {
      const isScenario = event.source === 'scenario'
      return {
        id: event.id,
        index: position + 1,
        date: event.date,
        label: event.label,
        amount: event.amount,
        balance: event.balanceAfter,
        kind: event.kind,
        isPrediction: event.isPrediction,
        isLowPoint: event.id === forecast.lowPointEventId,
        isPayday: event.isPrimaryIncome,
        isScenario,
        headline: headlineFor(event.kind, event.label, isScenario),
        detail: `${formatDisplayDate(event.date)} · ${event.label} ${
          event.amount < 0 ? '−' : '+'
        }${formatCurrency(Math.abs(event.amount))}`,
        description: describe(
          event.date,
          event.label,
          event.amount,
          event.balanceAfter,
          event.kind,
          event.isPrediction,
          isScenario,
        ),
      }
    }),
  ]

  const balances = points.map((point) => point.balance)
  const hasNegative = balances.some((balance) => balance < 0)

  return {
    points,
    lowIndex: Math.max(
      points.findIndex((point) => point.isLowPoint),
      0,
    ),
    paydayIndex: points.findIndex((point) => point.isPayday) === -1
      ? null
      : points.findIndex((point) => point.isPayday),
    min: Math.min(...balances),
    max: Math.max(...balances),
    hasNegative,
  }
}

/**
 * One vertical scale across several series, so a before/after comparison is
 * read by eye rather than by re-reading the axis. Zero is always included when
 * any series goes below it, so the baseline means something.
 */
export function combineScale(...series: RunwaySeries[]): RunwayScale {
  const mins = series.map((s) => s.min)
  const maxes = series.map((s) => s.max)
  const anyNegative = series.some((s) => s.hasNegative)
  return {
    min: Math.min(...mins, anyNegative ? 0 : Math.min(...mins)),
    max: Math.max(...maxes, 0),
  }
}
