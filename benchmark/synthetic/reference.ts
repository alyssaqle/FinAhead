/**
 * Independent reference implementation — ground truth for financial results.
 *
 * This file deliberately imports NOTHING from `src/`. It re-implements, from the
 * documented rules alone, the arithmetic the benchmark checks FinAhead against:
 * ordering events, walking a running balance, finding the low point before
 * income, and inserting or removing a scenario.
 *
 * Everything is integer minor units (cents/pence). There is no floating-point
 * money anywhere in this file, so the expected answers cannot inherit a
 * rounding bug from the implementation under test.
 *
 * The documented rules it encodes:
 *   - Events on the same date apply expenses first, then income.
 *   - Within one kind on one date, the larger outflow applies first; ties break
 *     on event id.
 *   - Predicted events must fall strictly after the as-of date.
 *   - A scenario may fall on the as-of date itself.
 *   - The projected low is the minimum of the starting balance and every
 *     running balance strictly before the primary income event.
 */

export type RefKind = 'expense' | 'income'

export interface RefEvent {
  id: string
  date: string
  /** Signed minor units: negative out, positive in. */
  amountMinor: number
  kind: RefKind
  isPrimaryIncome: boolean
  isScenario: boolean
}

export interface RefResult {
  orderedIds: string[]
  /** Running balance in minor units after each ordered event. */
  balancesMinor: number[]
  lowMinor: number
  lowDate: string
  /** Id of the event that produced the low, or null when it is the start. */
  lowEventId: string | null
  goesNegative: boolean
  horizonDate: string
  nextIncomeId: string | null
}

// ---------------------------------------------------------------------------
// Dates — implemented here so ground truth shares no code with production.
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000

export function parseDate(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function isoFrom(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDaysRef(iso: string, days: number): string {
  return isoFrom(parseDate(iso) + days * DAY_MS)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b) - parseDate(a)) / DAY_MS)
}

export function daysInMonthRef(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

/** Add whole months, clamping the day to the end of the target month. */
export function addMonthsRef(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const total = (m - 1) + months
  const year = y + Math.floor(total / 12)
  const month = ((total % 12) + 12) % 12
  const day = Math.min(d, daysInMonthRef(year, month + 1))
  return isoFrom(Date.UTC(year, month, day))
}

// ---------------------------------------------------------------------------
// Ordering and the running balance
// ---------------------------------------------------------------------------

const KIND_ORDER: Record<RefKind, number> = { expense: 0, income: 1 }

/** The documented same-date rule, implemented independently. */
export function orderEvents(events: RefEvent[]): RefEvent[] {
  return [...events].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    const kind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    if (kind !== 0) return kind
    if (a.amountMinor !== b.amountMinor) return a.amountMinor - b.amountMinor
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/**
 * Compute the expected forecast.
 *
 * `events` are the account's declared future events — they are NOT detected.
 * Detection quality is measured separately; this measures arithmetic.
 */
export function referenceForecast(
  startingBalanceMinor: number,
  asOfDate: string,
  events: RefEvent[],
  fallbackHorizonDays = 35,
): RefResult {
  const primaryIncome =
    events.find((e) => e.kind === 'income' && e.isPrimaryIncome && e.date > asOfDate) ?? null
  const horizonDate = primaryIncome
    ? primaryIncome.date
    : addDaysRef(asOfDate, fallbackHorizonDays)

  const inWindow = events.filter((e) =>
    e.isScenario
      ? e.date >= asOfDate && e.date <= horizonDate
      : e.date > asOfDate && e.date <= horizonDate,
  )

  const ordered = orderEvents(inWindow)

  const balances: number[] = []
  let balance = startingBalanceMinor
  for (const event of ordered) {
    balance += event.amountMinor
    balances.push(balance)
  }

  const incomeIndex = primaryIncome
    ? ordered.findIndex((e) => e.id === primaryIncome.id)
    : -1
  const windowEnd = incomeIndex === -1 ? ordered.length : incomeIndex

  let lowMinor = startingBalanceMinor
  let lowDate = asOfDate
  let lowEventId: string | null = null
  for (let i = 0; i < windowEnd; i += 1) {
    if (balances[i] < lowMinor) {
      lowMinor = balances[i]
      lowDate = ordered[i].date
      lowEventId = ordered[i].id
    }
  }

  return {
    orderedIds: ordered.map((e) => e.id),
    balancesMinor: balances,
    lowMinor,
    lowDate,
    lowEventId,
    goesNegative: lowMinor < 0 || balances.some((b) => b < 0),
    horizonDate,
    nextIncomeId: incomeIndex === -1 ? null : ordered[incomeIndex].id,
  }
}

/** Insert a scenario and recompute, independently of production. */
export function referenceWithScenario(
  startingBalanceMinor: number,
  asOfDate: string,
  events: RefEvent[],
  scenario: { id: string; date: string; amountMinor: number },
): RefResult {
  return referenceForecast(startingBalanceMinor, asOfDate, [
    ...events,
    {
      id: scenario.id,
      date: scenario.date,
      // A scenario is always an outflow, whatever sign was supplied.
      amountMinor: -Math.abs(scenario.amountMinor),
      kind: 'expense',
      isPrimaryIncome: false,
      isScenario: true,
    },
  ])
}
