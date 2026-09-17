/**
 * Every threshold used by FinAhead's detection and forecast rules.
 *
 * These live here (and nowhere else) so that the rules governing a financial
 * prediction can be read, reviewed and changed in one place, and so that no
 * component can quietly disagree with the engine about what "recurring" means.
 */

// ---------------------------------------------------------------------------
// Cadence windows
// ---------------------------------------------------------------------------

/** A gap this small or larger counts as "about a month". */
export const MONTHLY_MIN_INTERVAL_DAYS = 25
/** A gap this large or smaller counts as "about a month". */
export const MONTHLY_MAX_INTERVAL_DAYS = 35

/** A gap this small or larger counts as "about every two weeks". */
export const BIWEEKLY_MIN_INTERVAL_DAYS = 12
/** A gap this large or smaller counts as "about every two weeks". */
export const BIWEEKLY_MAX_INTERVAL_DAYS = 16

// ---------------------------------------------------------------------------
// Evidence thresholds
// ---------------------------------------------------------------------------

/**
 * Absolute minimum number of historical occurrences before FinAhead will call
 * something recurring. Two occurrences produce exactly one interval, which is
 * weak evidence, so such predictions are always labelled low confidence.
 */
export const MIN_OCCURRENCES = 2

/** Occurrences required before a prediction may be labelled medium or better. */
export const PREFERRED_OCCURRENCES = 3

/**
 * Maximum allowed spread in amount, measured as (max - min) / mean over the
 * absolute amounts. A merchant whose charges vary more than this is treated as
 * variable spending rather than a fixed obligation.
 */
export const MAX_AMOUNT_VARIATION_PCT = 0.2

/** Amount spread at or below this is treated as a fixed, highly stable charge. */
export const STABLE_AMOUNT_VARIATION_PCT = 0.05

// ---------------------------------------------------------------------------
// Forecast horizon
// ---------------------------------------------------------------------------

/**
 * How far ahead the timeline runs when no recurring income can be identified.
 * With income detected, the horizon is the next expected deposit instead.
 */
export const FALLBACK_HORIZON_DAYS = 35

/**
 * Same-day ordering rule. Within a single date, events are applied in this
 * order so that the running balance reflects the most conservative reading of
 * that day: money leaves before money arrives.
 */
export const SAME_DAY_KIND_ORDER: Record<'expense' | 'income', number> = {
  expense: 0,
  income: 1,
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/** Shown on every screen. FinAhead does not give financial advice. */
export const DISCLAIMER =
  'FinAhead provides estimates based on the information available. Forecasts may be incomplete or inaccurate and are not financial advice.'
