/**
 * Deterministic synthetic benchmark generator.
 *
 * Everything here flows from one fixed seed, so the whole dataset and manifest
 * regenerate byte-for-byte. Nothing in this file imports FinAhead production
 * code: labels and expected events are DECLARED as the account is built, before
 * any detector runs, so the ground truth cannot be contaminated by the
 * implementation under test.
 *
 * Deliberately NOT tuned to FinAhead's thresholds. Several archetypes sit just
 * outside them (amount drift beyond 20%, intervals of 36+ days, two-occurrence
 * histories, near-monthly coincidences), because a benchmark that only contains
 * cases the implementation already handles measures nothing.
 */

import {
  addDaysRef, addMonthsRef, daysBetween, type RefEvent,
} from './reference'

export const SEED = 20260101
export const ACCOUNT_COUNT = 200
export const SCENARIOS_PER_ACCOUNT = 5
/** Share of accounts that are deliberately awkward. */
export const CHALLENGE_SHARE = 0.3

/** Mulberry32 — small, fast, fully deterministic from a 32-bit seed. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T,>(rng: () => number, items: readonly T[]): T =>
  items[Math.floor(rng() * items.length)]
const int = (rng: () => number, lo: number, hi: number) =>
  lo + Math.floor(rng() * (hi - lo + 1))

export type TxnType = 'income' | 'recurring-expense' | 'neither'

export interface SynthTxn {
  accountId: string
  transactionId: string
  date: string
  merchant: string
  amountMinor: number
  category: string
  /** Declared ground truth, never derived from a detector. */
  truth: TxnType
}

export interface SynthScenario {
  id: string
  kind: 'purchase' | 'investment'
  date: string
  amountMinor: number
  label: string
}

export interface SynthAccount {
  accountId: string
  isChallenge: boolean
  archetype: string
  asOfDate: string
  startingBalanceMinor: number
  transactions: SynthTxn[]
  /** Declared truth about which normalised merchants recur / are income. */
  trueRecurringMerchants: string[]
  trueIncomeMerchants: string[]
  /** Declared future events. Expected ordering/balances come from reference.ts. */
  upcoming: RefEvent[]
  scenarios: SynthScenario[]
}

// --- merchant vocabulary ----------------------------------------------------

const RENT = ['CEDAR RIDGE APTS RENT', 'MAPLE COURT LETTINGS', 'OAKWOOD PROPERTY MGMT']
const UTILITY = ['CITY POWER CO', 'NORTHERN GAS', 'AQUA WATER SERVICES']
const PHONE = ['MINT MOBILE 8887890', 'VERIZON WIRELESS', 'O2 UK']
const GYM = ['PLANET FITNESS #2231', 'PUREGYM NOTTINGHAM', 'ANYTIME FITNESS 44']
const STREAMING = ['SPOTIFY USA 877-778-1161', 'NETFLIX.COM', 'HULU 8774884']
const LOAN = ['NELNET STUDENT LOAN', 'SALLIE MAE EDU', 'STUDENT LOANS CO']
const CARD = ['CHASE CARD PAYMENT 4421', 'BARCLAYCARD PYMT', 'AMEX PAYMENT 7781']
const GROCERY = ["TRADER JOE'S #455", 'SAFEWAY 1123', 'LIDL GB NOTTINGHA', 'ALDI STORE 88']
const TRANSPORT = ['UBER *TRIP 8842', 'LYFT RIDE 221', 'EAST MIDS RAILWAY']
const ONE_OFF = ['REI ADVENTURE OUTFITTERS #88', 'CAMPUS BOOKSTORE', 'CVS PHARMACY 7712', 'IKEA NOTTINGHAM']
const COFFEE = ['STARBUCKS 00291', 'COSTA COFFEE 118', 'BLUE BOTTLE SQ *']
const DINING = ['CHIPOTLE 2284', 'DOORDASH*THAI GARDEN', 'PIZZA EXPRESS 42']
const EMPLOYER = ['NORTHGATE UNIV PAYROLL', 'ACME CORP PAYROLL', 'BLUEBIRD CAFE WAGES', 'CITY HOSPITAL PAY']
const SIDE_INCOME = ['ZELLE FROM PARENT', 'ETSY PAYOUT', 'TUTORING TRANSFER']

/** Income cadences, in days. Semimonthly is approximated at 15/16-day steps. */
const CADENCES = [
  { name: 'weekly', days: 7 },
  { name: 'biweekly', days: 14 },
  { name: 'semimonthly', days: 15 },
  { name: 'monthly', days: 30 },
] as const

/**
 * As-of dates chosen to force calendar edge cases across the population:
 * month ends, February, and a leap day.
 */
const AS_OF_POOL = [
  '2026-01-31', '2026-02-26', '2026-02-28', '2026-03-30', '2026-04-15',
  '2026-05-31', '2026-06-14', '2026-07-31', '2026-08-20', '2026-09-16',
  '2026-10-31', '2026-11-29', '2026-12-31', '2027-01-30', '2028-02-28',
  '2028-02-29', '2028-03-31', '2027-11-30', '2027-02-27', '2026-04-30',
]

function normaliseKeyGuess(merchant: string): string {
  // The generator's own idea of the merchant identity, used only to declare
  // labels. It is intentionally simple and does not mirror production code.
  return merchant
    .toLowerCase()
    .replace(/#?\d{3,}/g, ' ')
    .replace(/[*#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function generate(seed = SEED) {
  const rng = mulberry32(seed)
  const accounts: SynthAccount[] = []

  for (let i = 0; i < ACCOUNT_COUNT; i += 1) {
    const isChallenge = i % 10 < CHALLENGE_SHARE * 10
    accounts.push(buildAccount(i, rng, isChallenge))
  }

  return { seed, accounts }
}

function buildAccount(index: number, rng: () => number, isChallenge: boolean): SynthAccount {
  const accountId = `ACC${String(index + 1).padStart(4, '0')}`
  const asOfDate = AS_OF_POOL[index % AS_OF_POOL.length]
  const historyDays = int(rng, 130, 165)
  const historyStart = addDaysRef(asOfDate, -historyDays)

  const transactions: SynthTxn[] = []
  const upcoming: RefEvent[] = []
  const trueRecurring = new Set<string>()
  const trueIncome = new Set<string>()
  let txnSeq = 0

  const add = (date: string, merchant: string, amountMinor: number, category: string, truth: TxnType) => {
    txnSeq += 1
    transactions.push({
      accountId,
      transactionId: `${accountId}-T${String(txnSeq).padStart(4, '0')}`,
      date, merchant, amountMinor, category, truth,
    })
  }

  // ---- income ------------------------------------------------------------
  const cadence = CADENCES[index % CADENCES.length]
  const employer = pick(rng, EMPLOYER)
  const basePay = int(rng, 90_000, 260_000)
  // Challenge accounts get variable pay that can exceed the 20% band.
  const payJitterPct = isChallenge ? int(rng, 0, 28) : int(rng, 0, 4)

  // Anchor the next payday 6-14 days out so there is a real pre-payday window.
  const daysToPayday = int(rng, 6, 14)
  let payDate = addDaysRef(asOfDate, daysToPayday - cadence.days)
  const payHistory: string[] = []
  while (payDate > historyStart) {
    payHistory.push(payDate)
    payDate = addDaysRef(payDate, -cadence.days)
  }
  payHistory.reverse()
  payHistory.forEach((date, n) => {
    const drift = Math.round((basePay * payJitterPct) / 100) * (n % 2 === 0 ? 1 : -1)
    add(date, employer, basePay + Math.round(drift / (n + 1)), 'Income', 'income')
  })
  trueIncome.add(normaliseKeyGuess(employer))

  const nextPayday = addDaysRef(asOfDate, daysToPayday)
  upcoming.push({
    id: `income:${normaliseKeyGuess(employer)}`,
    date: nextPayday, amountMinor: basePay, kind: 'income',
    isPrimaryIncome: true, isScenario: false,
  })

  // A second income stream on ~40% of accounts.
  if (rng() < 0.4) {
    const side = pick(rng, SIDE_INCOME)
    const sideAmount = int(rng, 8_000, 45_000)
    let d = addDaysRef(asOfDate, int(rng, 2, daysToPayday - 1) - 30)
    const sideDates: string[] = []
    while (d > historyStart) { sideDates.push(d); d = addMonthsRef(d, -1) }
    sideDates.reverse().forEach((date) => add(date, side, sideAmount, 'Transfer', 'income'))
    if (sideDates.length >= 2) {
      trueIncome.add(normaliseKeyGuess(side))
      const next = addMonthsRef(sideDates[sideDates.length - 1], 1)
      if (next > asOfDate && next <= nextPayday) {
        upcoming.push({
          id: `income:${normaliseKeyGuess(side)}`,
          date: next, amountMinor: sideAmount, kind: 'income',
          isPrimaryIncome: false, isScenario: false,
        })
      }
    }
  }

  // ---- recurring obligations ---------------------------------------------
  const obligations: { pool: readonly string[]; min: number; max: number; category: string }[] = [
    { pool: RENT, min: 60_000, max: 150_000, category: 'Housing' },
    { pool: CARD, min: 12_000, max: 45_000, category: 'Credit card' },
    { pool: LOAN, min: 8_000, max: 30_000, category: 'Loans' },
    { pool: PHONE, min: 1_500, max: 6_000, category: 'Utilities' },
    { pool: UTILITY, min: 4_000, max: 14_000, category: 'Utilities' },
    { pool: GYM, min: 1_500, max: 5_500, category: 'Health' },
    { pool: STREAMING, min: 699, max: 1_799, category: 'Subscriptions' },
  ]

  const obligationCount = int(rng, 4, 7)
  for (let o = 0; o < obligationCount; o += 1) {
    const spec = obligations[o % obligations.length]
    const merchant = pick(rng, spec.pool)
    const key = normaliseKeyGuess(merchant)
    if (trueRecurring.has(key)) continue

    const amount = int(rng, spec.min, spec.max)
    const dueIn = int(rng, 1, daysToPayday)
    const anchor = addDaysRef(asOfDate, dueIn)

    // Challenge variants, chosen per obligation.
    const variant = isChallenge ? int(rng, 0, 4) : 0
    const amountDriftPct = variant === 1 ? int(rng, 22, 45) : isChallenge ? int(rng, 0, 12) : int(rng, 0, 5)
    const dateJitter = variant === 2 ? 4 : isChallenge ? 2 : 0
    const skipOne = variant === 3
    const shortHistory = variant === 4

    const occurrences = shortHistory ? 2 : int(rng, 3, 4)
    const dates: string[] = []
    for (let k = occurrences; k >= 1; k -= 1) {
      let d = addMonthsRef(anchor, -k)
      if (dateJitter > 0) d = addDaysRef(d, int(rng, -dateJitter, dateJitter))
      if (d > historyStart && d < asOfDate) dates.push(d)
    }
    if (dates.length < 2) continue

    const kept = skipOne && dates.length > 2 ? dates.filter((_, n) => n !== 1) : dates
    kept.forEach((date, n) => {
      const drift = Math.round((amount * amountDriftPct) / 100)
      const signed = n % 2 === 0 ? drift : -drift
      add(date, merchant, -(amount + Math.round(signed / 2)), spec.category, 'recurring-expense')
    })

    // The DECLARED truth: this merchant recurs, and this is its next event.
    trueRecurring.add(key)
    upcoming.push({
      id: `expense:${key}`,
      date: anchor, amountMinor: -amount, kind: 'expense',
      isPrimaryIncome: false, isScenario: false,
    })
  }

  // ---- noise that must NOT be predicted ------------------------------------
  // Everyday spending: frequent, variable, and never on a monthly cadence.
  const groceryMerchant = pick(rng, GROCERY)
  let g = addDaysRef(asOfDate, -int(rng, 1, 4))
  while (g > historyStart) {
    add(g, groceryMerchant, -int(rng, 1_200, 9_500), 'Groceries', 'neither')
    g = addDaysRef(g, -int(rng, 3, 6))
  }

  const coffeeMerchant = pick(rng, COFFEE)
  let c = addDaysRef(asOfDate, -int(rng, 1, 3))
  while (c > historyStart) {
    add(c, coffeeMerchant, -int(rng, 250, 950), 'Dining', 'neither')
    c = addDaysRef(c, -int(rng, 2, 4))
  }

  const diningMerchant = pick(rng, DINING)
  let dn = addDaysRef(asOfDate, -int(rng, 2, 9))
  while (dn > historyStart) {
    add(dn, diningMerchant, -int(rng, 900, 6_500), 'Dining', 'neither')
    dn = addDaysRef(dn, -int(rng, 5, 11))
  }

  const transportMerchant = pick(rng, TRANSPORT)
  let t = addDaysRef(asOfDate, -int(rng, 3, 12))
  while (t > historyStart) {
    add(t, transportMerchant, -int(rng, 500, 4_200), 'Transport', 'neither')
    t = addDaysRef(t, -int(rng, 5, 13))
  }

  // One-off purchases and transfers.
  for (let k = 0; k < int(rng, 4, 9); k += 1) {
    add(addDaysRef(asOfDate, -int(rng, 1, historyDays - 1)), pick(rng, ONE_OFF),
      -int(rng, 1_500, 18_000), 'Shopping', 'neither')
  }

  // Misleading pattern: two similar purchases ~30 days apart at a merchant that
  // is NOT an obligation. Interval looks monthly; only the amount spread or the
  // thin history should keep it out.
  if (isChallenge) {
    const decoy = pick(rng, ONE_OFF)
    if (!trueRecurring.has(normaliseKeyGuess(decoy))) {
      const base = int(rng, 2_000, 9_000)
      const d1 = addDaysRef(asOfDate, -int(rng, 35, 45))
      add(d1, decoy, -base, 'Shopping', 'neither')
      add(addDaysRef(d1, 30), decoy, -Math.round(base * (1 + int(rng, 25, 60) / 100)), 'Shopping', 'neither')
    }
  }

  // Same-date pile-ups: force several events onto one historical day.
  const pileDate = addDaysRef(asOfDate, -int(rng, 10, 40))
  for (let k = 0; k < 3; k += 1) {
    add(pileDate, pick(rng, GROCERY), -int(rng, 700, 5_000), 'Groceries', 'neither')
  }

  // ---- starting balance ----------------------------------------------------
  // Chosen so the population spans comfortable, near-zero, exactly-zero-at-low
  // and already-negative accounts.
  const obligationTotal = upcoming
    .filter((e) => e.kind === 'expense')
    .reduce((sum, e) => sum + Math.abs(e.amountMinor), 0)
  const bucket = index % 10
  let startingBalanceMinor: number
  if (bucket === 0) startingBalanceMinor = obligationTotal            // low lands exactly on 0
  else if (bucket === 1) startingBalanceMinor = obligationTotal - int(rng, 5_000, 60_000) // negative
  else if (bucket === 2) startingBalanceMinor = int(rng, 0, 3_000)    // nearly empty
  else startingBalanceMinor = obligationTotal + int(rng, 2_000, 180_000)

  // ---- scenarios -----------------------------------------------------------
  const scenarios: SynthScenario[] = []
  for (let s = 0; s < SCENARIOS_PER_ACCOUNT; s += 1) {
    const offset = Math.min(daysToPayday, Math.max(0, int(rng, 0, daysToPayday)))
    scenarios.push({
      id: `${accountId}-S${s + 1}`,
      kind: s % 3 === 2 ? 'investment' : 'purchase',
      date: addDaysRef(asOfDate, offset),
      amountMinor: int(rng, 500, 60_000),
      label: s % 3 === 2 ? 'Hypothetical investment' : 'Weekend trip',
    })
  }

  transactions.sort((a, b) =>
    a.date === b.date ? a.transactionId.localeCompare(b.transactionId) : a.date < b.date ? -1 : 1,
  )

  return {
    accountId,
    isChallenge,
    archetype: `${cadence.name}-income/${obligationCount}-obligations${isChallenge ? '/challenge' : ''}`,
    asOfDate,
    startingBalanceMinor,
    transactions,
    trueRecurringMerchants: [...trueRecurring].sort(),
    trueIncomeMerchants: [...trueIncome].sort(),
    upcoming,
    scenarios,
  }
}

/** FinAhead-schema CSV for one account. */
export function accountCsv(account: SynthAccount): string {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const lines = ['date,merchant,amount,category']
  for (const t of account.transactions) {
    lines.push([t.date, escape(t.merchant), (t.amountMinor / 100).toFixed(2), escape(t.category)].join(','))
  }
  return `${lines.join('\n')}\n`
}

/** Full dataset as one CSV with the extra benchmark columns. */
export function datasetCsv(accounts: SynthAccount[]): string {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const lines = ['account_id,transaction_id,date,merchant,amount,category,truth']
  for (const a of accounts) {
    for (const t of a.transactions) {
      lines.push([
        t.accountId, t.transactionId, t.date, escape(t.merchant),
        (t.amountMinor / 100).toFixed(2), escape(t.category), t.truth,
      ].join(','))
    }
  }
  return `${lines.join('\n')}\n`
}

export { daysBetween }
