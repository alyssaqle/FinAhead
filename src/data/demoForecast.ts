/**
 * The demo account's forecast, computed by the real pipeline.
 *
 * The landing page and the sample-account card both show a preview of the
 * product. Rather than keeping a hand-written copy of what the demo "looks
 * like" — which silently rots the moment a threshold or an amount changes —
 * both run the same detectors and forecast engine the application uses, so the
 * preview figures and the forecast the button opens cannot disagree.
 *
 * Memoised per as-of date because it is pure and the inputs are fixed.
 */

import { buildDemoDataset } from './demoData'
import { normalizeTransactions } from '../domain/normalizeMerchant'
import { detectRecurringExpenses } from '../domain/detectRecurringExpenses'
import { detectIncome } from '../domain/detectIncome'
import { buildForecast, type ForecastInput } from '../domain/buildForecast'
import type { ForecastResult, PredictedEvent } from '../domain/types'

export interface DemoForecast {
  forecast: ForecastResult
  predictions: PredictedEvent[]
  /** The same input, so a preview can run a scenario through the real engine. */
  input: ForecastInput
  transactionCount: number
}

const cache = new Map<string, DemoForecast>()

export function buildDemoForecast(asOfDate: string): DemoForecast {
  const cached = cache.get(asOfDate)
  if (cached) return cached

  const demo = buildDemoDataset(asOfDate)
  const normalized = normalizeTransactions(demo.transactions)
  const predictions = [
    ...detectRecurringExpenses(normalized, asOfDate),
    ...detectIncome(normalized, asOfDate).candidates,
  ]

  const input: ForecastInput = {
    currentBalance: demo.currentBalance,
    asOfDate,
    predictions,
  }

  const result: DemoForecast = {
    forecast: buildForecast(input),
    predictions,
    input,
    transactionCount: demo.transactions.length,
  }

  cache.set(asOfDate, result)
  return result
}
