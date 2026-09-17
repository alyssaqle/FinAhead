/**
 * Date helpers for ISO `YYYY-MM-DD` strings.
 *
 * All arithmetic is done in UTC. Using UTC (rather than the browser's local
 * timezone) means the same input always produces the same output regardless of
 * where the user is or whether a daylight-saving boundary falls inside the
 * forecast window, which is what makes the forecast reproducible.
 */

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const MS_PER_DAY = 86_400_000

/** True when `value` is a real calendar date in `YYYY-MM-DD` form. */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (month < 1 || month > 12) return false
  if (day < 1 || day > daysInMonth(year, month)) return false
  return true
}

/** Number of days in a given 1-indexed month. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Parse an ISO date into a UTC `Date`. Throws only on programmer error. */
export function parseIsoDate(value: string): Date {
  if (!isValidIsoDate(value)) {
    throw new Error(`Not a valid ISO date: ${value}`)
  }
  return new Date(`${value}T00:00:00.000Z`)
}

/** Format a `Date` as an ISO `YYYY-MM-DD` string using its UTC fields. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function diffDays(from: string, to: string): number {
  return Math.round(
    (parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / MS_PER_DAY,
  )
}

/** `date` shifted by `days` (may be negative). */
export function addDays(date: string, days: number): string {
  const next = parseIsoDate(date)
  next.setUTCDate(next.getUTCDate() + days)
  return toIsoDate(next)
}

/**
 * `date` shifted by whole months, clamping the day to the end of the target
 * month. January 31 + 1 month is February 28 (or 29), not March 3, which is how
 * billers actually behave for month-end charges.
 */
export function addMonthsClamped(date: string, months: number): string {
  const source = parseIsoDate(date)
  const year = source.getUTCFullYear()
  const month = source.getUTCMonth() + months
  const targetYear = year + Math.floor(month / 12)
  const targetMonth = ((month % 12) + 12) % 12
  const day = Math.min(
    source.getUTCDate(),
    daysInMonth(targetYear, targetMonth + 1),
  )
  return toIsoDate(new Date(Date.UTC(targetYear, targetMonth, day)))
}

/** Today's date in the user's local timezone, as an ISO string. */
export function todayIso(now: Date = new Date()): string {
  return toIsoDate(
    new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
    ),
  )
}

/** `Sep 1, 2026` — used for every date the user reads. */
export function formatDisplayDate(value: string): string {
  if (!isValidIsoDate(value)) return value
  return parseIsoDate(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** `Sep 1` — used inside dense timeline rows where the year is implied. */
export function formatShortDate(value: string): string {
  if (!isValidIsoDate(value)) return value
  return parseIsoDate(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** `July 1` — used in prediction copy, where the year is obvious from context. */
export function formatMonthDay(value: string): string {
  if (!isValidIsoDate(value)) return value
  return parseIsoDate(value).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** `July 1, August 1 and September 1` — the evidence sentence. */
export function formatDateList(values: string[]): string {
  const parts = values.map(formatMonthDay)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}
