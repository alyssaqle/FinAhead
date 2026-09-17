/**
 * The forecast engine.
 *
 * Takes a balance, a date, a set of predictions and the user's corrections, and
 * produces an ordered timeline with a running balance after every event, plus
 * the lowest balance reached before the next income deposit.
 *
 * Three rules govern the output and are surfaced in the UI and the docs:
 *
 * 1. SAME-DAY ORDERING. Events on the same date are applied expenses first,
 *    then income. Within the same kind, the larger outflow is applied first.
 *    This is the conservative reading of a day: if rent and a paycheck both
 *    land on the 1st, the timeline shows the dip before the recovery. Ordering
 *    is fully determined by (date, kind, amount, id), never by input order.
 *
 * 2. THE LOW POINT IS MEASURED BEFORE INCOME. The projected lowest balance
 *    considers the starting balance and every event that falls before the next
 *    primary income event. The income deposit itself, and anything after it, is
 *    excluded — the question being answered is "how low do I go before payday".
 *
 * 3. EVENTS ON THE AS-OF DATE ARE ALREADY SPENT. Predicted charges must fall
 *    strictly after the as-of date to enter the timeline, because the current
 *    balance already reflects today. A scenario is the exception: a purchase
 *    the user is considering today has not happened yet, so it may be dated
 *    today.
 *
 * Nothing here is specific to the demo dataset. The engine has no knowledge of
 * any particular merchant, amount or date.
 */

import type {
  ForecastEvent,
  ForecastResult,
  ForecastWarning,
  PredictedEvent,
  PredictionEdit,
  Scenario,
} from './types'
import { FALLBACK_HORIZON_DAYS, SAME_DAY_KIND_ORDER } from './constants'
import { addDays, formatDisplayDate } from './dateUtils'
import { roundMoney } from './money'

export interface ForecastInput {
  /** The user's checking balance, true as of `asOfDate`. */
  currentBalance: number
  asOfDate: string
  /** Detected and/or manually entered predictions, in any order. */
  predictions: PredictedEvent[]
  /** Corrections keyed by prediction id. */
  edits?: Record<string, PredictionEdit>
  /** Ids the user marked "not recurring". */
  rejectedIds?: string[]
  /** A hypothetical purchase to include in the timeline. */
  scenario?: Scenario | null
  /** Days to look ahead when no income is known. Defaults to FALLBACK_HORIZON_DAYS. */
  fallbackHorizonDays?: number
}

export const SCENARIO_EVENT_ID = 'scenario'

/**
 * Apply the user's edits and rejections to the raw predictions.
 *
 * Exported because the UI renders the resolved list (an edited prediction shows
 * the user's own figure), and because rendering and forecasting must never
 * disagree about what the current set of predictions is.
 */
export function resolvePredictions(
  predictions: PredictedEvent[],
  edits: Record<string, PredictionEdit> = {},
  rejectedIds: string[] = [],
): PredictedEvent[] {
  const rejected = new Set(rejectedIds)

  const kept = predictions
    .filter((prediction) => !rejected.has(prediction.id))
    .map((prediction) => {
      const edit = edits[prediction.id]
      if (!edit || (edit.amount === undefined && edit.date === undefined)) {
        return prediction
      }

      // Keep the sign convention no matter what the form handed us: an expense
      // is always an outflow, income is always an inflow.
      const magnitude =
        edit.amount === undefined
          ? Math.abs(prediction.amount)
          : Math.abs(edit.amount)

      return {
        ...prediction,
        amount: prediction.kind === 'expense' ? -magnitude : magnitude,
        date: edit.date ?? prediction.date,
        source: prediction.source === 'user-manual' ? 'user-manual' : 'user-edited',
      } satisfies PredictedEvent
    })

  /**
   * If the primary income stream was rejected or edited away, promote the
   * earliest remaining income prediction so the forecast still has a payday to
   * measure against. If none remain, the forecast reports no income.
   */
  const incomes = kept.filter((prediction) => prediction.kind === 'income')
  const hasPrimary = incomes.some((prediction) => prediction.isPrimaryIncome)
  if (!hasPrimary && incomes.length > 0) {
    const earliest = [...incomes].sort((a, b) =>
      a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1,
    )[0]
    return kept.map((prediction) =>
      prediction.id === earliest.id
        ? { ...prediction, isPrimaryIncome: true }
        : prediction,
    )
  }

  return kept
}

/** Deterministic timeline order. See rule 1 at the top of this file. */
function compareEvents(a: ForecastEvent, b: ForecastEvent): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  const kindDelta = SAME_DAY_KIND_ORDER[a.kind] - SAME_DAY_KIND_ORDER[b.kind]
  if (kindDelta !== 0) return kindDelta
  if (a.amount !== b.amount) return a.amount - b.amount
  return a.id.localeCompare(b.id)
}

function toForecastEvent(prediction: PredictedEvent): ForecastEvent {
  return {
    id: prediction.id,
    date: prediction.date,
    label: prediction.displayName,
    amount: prediction.amount,
    kind: prediction.kind,
    source: prediction.kind === 'income' ? 'predicted-income' : 'predicted-expense',
    isPrediction: true,
    balanceAfter: 0,
    predictedEventId: prediction.id,
    isPrimaryIncome: prediction.isPrimaryIncome,
  }
}

/**
 * Convert a scenario into a timeline event. The amount the user typed is a
 * magnitude; it always becomes an outflow.
 */
export function scenarioToForecastEvent(scenario: Scenario): ForecastEvent {
  return {
    id: SCENARIO_EVENT_ID,
    date: scenario.date,
    label: scenario.label?.trim()
      ? `${scenario.label.trim()} (what-if)`
      : 'Hypothetical purchase (what-if)',
    amount: -Math.abs(roundMoney(scenario.amount)),
    kind: 'expense',
    source: 'scenario',
    isPrediction: false,
    balanceAfter: 0,
    isPrimaryIncome: false,
  }
}

export function buildForecast(input: ForecastInput): ForecastResult {
  const {
    currentBalance,
    asOfDate,
    predictions,
    edits = {},
    rejectedIds = [],
    scenario = null,
    fallbackHorizonDays = FALLBACK_HORIZON_DAYS,
  } = input

  const resolved = resolvePredictions(predictions, edits, rejectedIds)

  // The payday the low point is measured against: the primary income stream's
  // next occurrence after today.
  const primaryIncome =
    resolved.find(
      (prediction) =>
        prediction.kind === 'income' &&
        prediction.isPrimaryIncome &&
        prediction.date > asOfDate,
    ) ?? null

  const horizonDate = primaryIncome
    ? primaryIncome.date
    : addDays(asOfDate, fallbackHorizonDays)

  const events: ForecastEvent[] = resolved
    .filter(
      (prediction) =>
        prediction.date > asOfDate && prediction.date <= horizonDate,
    )
    .map(toForecastEvent)

  if (scenario && scenario.date >= asOfDate && scenario.date <= horizonDate) {
    events.push(scenarioToForecastEvent(scenario))
  }

  events.sort(compareEvents)

  let balance = roundMoney(currentBalance)
  for (const event of events) {
    balance = roundMoney(balance + event.amount)
    event.balanceAfter = balance
  }

  // Rule 2: the low point ignores the payday itself and anything after it.
  const incomeIndex = primaryIncome
    ? events.findIndex((event) => event.id === primaryIncome.id)
    : -1
  const windowEnd = incomeIndex === -1 ? events.length : incomeIndex
  const windowEvents = events.slice(0, windowEnd)

  let lowestBalance = roundMoney(currentBalance)
  let lowestBalanceDate = asOfDate
  let lowPointEventId: string | null = null
  for (const event of windowEvents) {
    if (event.balanceAfter < lowestBalance) {
      lowestBalance = event.balanceAfter
      lowestBalanceDate = event.date
      lowPointEventId = event.id
    }
  }

  const warnings: ForecastWarning[] = []
  if (lowestBalance < 0) {
    warnings.push({
      code: 'negative-balance',
      message: `This forecast dips below zero on ${formatDisplayDate(
        lowestBalanceDate,
      )}. Check the predictions below — an incorrect amount or date will change this.`,
    })
  }
  if (!primaryIncome) {
    warnings.push({
      code: 'no-income-detected',
      message:
        'FinAhead could not identify your next income deposit, so this timeline runs on a fixed window instead of ending at your next payday.',
    })
  }
  if (!resolved.some((prediction) => prediction.kind === 'expense')) {
    warnings.push({
      code: 'no-recurring-expenses',
      message:
        'FinAhead did not find any repeating monthly charges in this history, so no upcoming obligations are projected.',
    })
  }

  const missingAssumptions: string[] = [
    'Everyday variable spending such as groceries, coffee and one-off purchases is not projected — only charges that repeat on a monthly schedule.',
  ]
  if (!primaryIncome) {
    missingAssumptions.push(
      'No income deposit is included in this forecast. Enter your expected income to measure your low point against your real payday.',
    )
  }
  if (rejectedIds.length > 0) {
    missingAssumptions.push(
      `${rejectedIds.length} prediction${
        rejectedIds.length === 1 ? ' was' : 's were'
      } marked "not recurring" and excluded from this forecast.`,
    )
  }

  return {
    asOfDate,
    startingBalance: roundMoney(currentBalance),
    horizonDate,
    events,
    nextIncome:
      incomeIndex === -1 ? null : (events[incomeIndex] ?? null),
    lowestBalance,
    lowestBalanceDate,
    lowPointEventId,
    warnings,
    missingAssumptions,
  }
}
