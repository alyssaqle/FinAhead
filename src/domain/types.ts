/**
 * FinAhead domain types.
 *
 * Every financial value in this app is a number of dollars (not cents) rounded
 * to 2 decimal places at the boundaries where it is produced. Signs are
 * consistent everywhere:
 *
 *   amount > 0  => money moving INTO the account (income / deposit)
 *   amount < 0  => money moving OUT of the account (expense / payment)
 *
 * Dates are always ISO `YYYY-MM-DD` strings and are compared lexicographically
 * or via the helpers in `dateUtils.ts`. No `Date` objects are stored in models,
 * which keeps every structure serialisable and every calculation reproducible.
 */

/** A single raw row of account history, as supplied by CSV or the demo dataset. */
export interface Transaction {
  /** Stable identifier derived from row position; unique within one dataset. */
  id: string
  /** ISO `YYYY-MM-DD`. */
  date: string
  /** Merchant string exactly as it appeared in the source data. */
  merchant: string
  /** Signed dollars. Positive = income, negative = expense. */
  amount: number
  /** Free-text category. May be an empty string. */
  category: string
}

/** A transaction plus the deterministic merchant normalisation applied to it. */
export interface NormalizedTransaction extends Transaction {
  /** Human-readable cleaned merchant, e.g. `Spotify`. */
  normalizedMerchant: string
  /** Lowercased comparison key for grouping, e.g. `spotify`. */
  merchantKey: string
}

/** How often a pattern repeats. V1 recognises these two cadences only. */
export type Cadence = 'biweekly' | 'monthly'

/**
 * Transparency label attached to every prediction. This is a description of the
 * evidence FinAhead has, NOT a probability. It is never used to gate a decision
 * for the user.
 */
export type ConfidenceLabel = 'low' | 'medium' | 'high'

/** The historical record that justifies a prediction, shown to the user verbatim. */
export interface RecurrenceEvidence {
  /** The supporting historical transactions, oldest first. */
  transactions: NormalizedTransaction[]
  /** Day gaps between consecutive supporting transactions. */
  intervalsDays: number[]
  /** Median of `intervalsDays`, used as the representative cadence. */
  medianIntervalDays: number
  /** (max - min) / mean over the absolute amounts. 0.1 means 10% spread. */
  amountVariationPct: number
  cadence: Cadence
  confidence: ConfidenceLabel
  /** Plain-language reason for the confidence label, rendered in the UI. */
  confidenceReason: string
}

export type PredictedEventKind = 'expense' | 'income'

/** Where a prediction came from, so the UI never presents a guess as a fact. */
export type PredictionSource =
  /** Produced by the detection rules from historical transactions. */
  | 'detected'
  /** Detected, then amount and/or date corrected by the user. */
  | 'user-edited'
  /** Entered entirely by the user (manual income fallback). */
  | 'user-manual'

/** One future money movement FinAhead expects, before any forecasting happens. */
export interface PredictedEvent {
  /** Stable across recalculations: `${kind}:${merchantKey}`. */
  id: string
  kind: PredictedEventKind
  merchantKey: string
  /** Normalised merchant used as the display label. */
  displayName: string
  /** Signed dollars: negative for an expense, positive for income. */
  amount: number
  /** ISO date the event is expected to occur. */
  date: string
  /** Null only for `user-manual` events, which have no historical evidence. */
  evidence: RecurrenceEvidence | null
  source: PredictionSource
  /**
   * True for the single income stream FinAhead treats as the user's primary
   * paycheck. The projected low point is measured before this event.
   */
  isPrimaryIncome: boolean
}

/** Corrections the user has applied to a prediction. */
export interface PredictionEdit {
  /** New signed amount. Omitted means "keep the detected amount". */
  amount?: number
  /** New ISO date. Omitted means "keep the detected date". */
  date?: string
}

/** A hypothetical purchase or transfer under evaluation. */
export interface Scenario {
  /**
   * Magnitude as the user typed it. Always entered as a positive number in the
   * UI; the scenario engine converts it to an outflow internally.
   */
  amount: number
  date: string
  label?: string
}

/** Why a forecast event exists. */
export type ForecastEventSource =
  | 'predicted-expense'
  | 'predicted-income'
  | 'scenario'

/** One row of the cash-flow timeline, with the running balance after it lands. */
export interface ForecastEvent {
  id: string
  date: string
  label: string
  /** Signed dollars. */
  amount: number
  kind: PredictedEventKind
  source: ForecastEventSource
  /** False only for the scenario row, which the user stated themselves. */
  isPrediction: boolean
  /** Account balance immediately after this event is applied. */
  balanceAfter: number
  /** Links a timeline row back to the prediction that produced it. */
  predictedEventId?: string
  isPrimaryIncome: boolean
}

export type ForecastWarningCode =
  | 'negative-balance'
  | 'no-income-detected'
  | 'no-recurring-expenses'
  | 'scenario-below-zero'

export interface ForecastWarning {
  code: ForecastWarningCode
  message: string
}

/** The complete, explainable output of the forecast engine. */
export interface ForecastResult {
  /** The date the forecast is computed from; `currentBalance` is true as of this date. */
  asOfDate: string
  startingBalance: number
  /** Last date covered by the forecast (inclusive). */
  horizonDate: string
  /** All future events in timeline order, each with its running balance. */
  events: ForecastEvent[]
  /** The primary income event the low point is measured against, if any. */
  nextIncome: ForecastEvent | null
  /** Lowest running balance strictly before `nextIncome` (or before the horizon). */
  lowestBalance: number
  /** Date of `lowestBalance`. Equals `asOfDate` when nothing is scheduled before income. */
  lowestBalanceDate: string
  /** Id of the event that produced the low point, or null if it is the starting balance. */
  lowPointEventId: string | null
  warnings: ForecastWarning[]
  /**
   * Plain-language statements of what this forecast does NOT account for, so the
   * number is never read as a complete picture.
   */
  missingAssumptions: string[]
}

/** Result of comparing a baseline forecast with one that includes a scenario. */
export interface ScenarioComparison {
  baseline: ForecastResult
  projected: ForecastResult
  /** projected.lowestBalance - baseline.lowestBalance. Negative = lower low point. */
  difference: number
  /** True when the projected forecast dips below zero at any point. */
  goesBelowZero: boolean
}

/** A single, user-facing validation problem. Never thrown, always returned. */
export interface ValidationError {
  /** Form field or CSV column the problem belongs to. */
  field: string
  /** Machine-readable code for tests and conditional UI. */
  code: string
  /** Complete sentence shown directly to the user. */
  message: string
  /** 1-based source row for CSV problems. */
  row?: number
}
