/**
 * Rounding, parsing and statistics shared by the detection and forecast engines.
 *
 * MONEY REPRESENTATION
 *
 * FinAhead is single-currency (USD) and holds amounts as a number of dollars
 * that is always an exact multiple of one cent. Cent exactness is established
 * at the two places a decimal enters the system — `parseMoney`, used by the CSV
 * reader and by every money input in the UI — and preserved afterwards by
 * rounding to cents at each accumulation step in the forecast engine.
 *
 * WHY NOT A MONEY LIBRARY
 *
 * The accumulation hazard a library like currency.js exists to fix (`2.51 + .01`
 * giving `2.5199999999999996`) is already handled here: the forecast engine
 * rounds to cents after every event, and that chain was verified exact against
 * an integer-cent reference over randomised transaction sets.
 *
 * The one real defect that testing did find — a half-cent such as `10.005`
 * resolving to `10.00` — cannot be fixed by any library that receives a
 * `number`, because `10.005` is already the double `10.00499999999999989…`
 * before the call. The information is lost at the string-to-double conversion,
 * so the fix has to be at the parse boundary, which is what `parseMoney` does.
 *
 * ROUNDING RULE
 *
 * Half away from zero, applied to the magnitude so that the direction does not
 * depend on the sign. (`Math.round` alone rounds halves toward +Infinity, which
 * would round a -0.005 expense and a +0.005 deposit in opposite directions.)
 */

/** Digits-only money, with an optional sign and decimal part. */
const MONEY_PATTERN = /^[+-]?\d+(\.\d+)?$/

/**
 * Convert a dollar amount to whole cents, rounding half away from zero.
 *
 * For a value that is already cent-exact this simply removes the floating-point
 * noise accumulated by addition (`730.0100000000001` -> `73001`).
 */
export function toCents(value: number): number {
  const cents = Math.sign(value) * Math.round(Math.abs(value) * 100)
  // `|| 0` normalises -0, which would otherwise fail an `Object.is` comparison
  // against 0 in tests and serialise as "-0".
  return cents || 0
}

/**
 * Round a dollar amount to cents. Use at accumulation boundaries, where the
 * input is already a multiple of a cent plus floating-point noise.
 *
 * Decimal text from a file or a form must go through `parseMoney` instead: by
 * the time a decimal string has become a `number`, a half-cent can no longer be
 * distinguished from the value just below it.
 */
export function roundMoney(value: number): number {
  return toCents(value) / 100
}

/**
 * Parse money written as text into whole cents, exactly.
 *
 * The conversion is done on the digits themselves rather than via `Number`, so
 * no binary rounding happens before the cent is decided. A third decimal place
 * rounds the cent half away from zero; anything that is not a plain decimal
 * number returns null for the caller to report.
 *
 * Accepts a leading `$`, thousands separators and surrounding whitespace, none
 * of which carry value.
 */
export function parseMoneyToCents(text: string): number | null {
  const cleaned = (text ?? '').replace(/[$,\s]/g, '')
  if (cleaned === '' || !MONEY_PATTERN.test(cleaned)) return null

  const isNegative = cleaned.startsWith('-')
  const [whole, fraction = ''] = cleaned.replace(/^[+-]/, '').split('.')

  const centsText = `${whole}${fraction.slice(0, 2).padEnd(2, '0')}`
  let cents = Number(centsText)
  if (!Number.isSafeInteger(cents)) return null

  // The third decimal digit alone decides the rounding: any digit after it can
  // only move the value further in the direction already chosen.
  if (Number(fraction[2] ?? '0') >= 5) cents += 1

  return (isNegative ? -cents : cents) || 0
}

/** `parseMoneyToCents` expressed in dollars. Null when the text is not money. */
export function parseMoney(text: string): number | null {
  const cents = parseMoneyToCents(text)
  return cents === null ? null : cents / 100
}

/** Median of a numeric list. Returns 0 for an empty list. */
export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

/**
 * Median of a list of money amounts, computed in whole cents.
 *
 * Kept separate from `median` because the even-length case averages the two
 * middle values, and for money that average must land on a cent: the midpoint
 * of $10.01 and $10.02 is a half-cent, and doing it in dollars resolves it by
 * whichever way the binary representation happens to fall. In cents the tie is
 * explicit and rounds half away from zero.
 */
export function medianMoney(values: number[]): number {
  if (values.length === 0) return 0

  const cents = values.map(toCents).sort((a, b) => a - b)
  const middle = Math.floor(cents.length / 2)

  if (cents.length % 2 !== 0) return cents[middle] / 100

  const sum = cents[middle - 1] + cents[middle]
  const half = sum / 2
  const rounded = half >= 0 ? Math.floor(half + 0.5) : Math.ceil(half - 0.5)
  return (rounded || 0) / 100
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * Spread of a list of amounts as a fraction of its mean: (max - min) / mean.
 * Returns 0 for a list of identical values and for an empty list.
 */
export function amountVariation(values: number[]): number {
  if (values.length === 0) return 0
  const average = mean(values)
  if (average === 0) return 0
  return (Math.max(...values) - Math.min(...values)) / Math.abs(average)
}

/** `$1,150.00`, or `-$1,150.00` for negative values. */
export function formatCurrency(value: number): string {
  const formatted = Math.abs(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return value < 0 ? `-${formatted}` : formatted
}

/** `+$1,412.55` / `-$1,150.00` — used for timeline rows where direction matters. */
export function formatSignedCurrency(value: number): string {
  const formatted = formatCurrency(Math.abs(value))
  return value < 0 ? `-${formatted}` : `+${formatted}`
}
