/**
 * Canonical edge-case fixtures — hand-specified, not generated.
 *
 * Each case declares its events, its as-of date and its expected answer in
 * integer minor units, written out by hand from the documented rules. The
 * generator cannot reach some of these reliably (exact zero at the low point,
 * a scenario landing on payday, a month-end rollover into February), so they
 * are stated explicitly.
 *
 * Expected values here are NOT produced by running FinAhead.
 */

import type { RefEvent } from './reference'

export interface Fixture {
  id: string
  why: string
  asOfDate: string
  startingBalanceMinor: number
  events: RefEvent[]
  scenario?: { date: string; amountMinor: number }
  expect: {
    orderedIds: string[]
    balancesMinor: number[]
    lowMinor: number
    lowDate: string
    goesNegative: boolean
  }
}

const expense = (id: string, date: string, amountMinor: number): RefEvent =>
  ({ id, date, amountMinor: -Math.abs(amountMinor), kind: 'expense', isPrimaryIncome: false, isScenario: false })
const income = (id: string, date: string, amountMinor: number, primary = true): RefEvent =>
  ({ id, date, amountMinor: Math.abs(amountMinor), kind: 'income', isPrimaryIncome: primary, isScenario: false })

export const FIXTURES: Fixture[] = [
  {
    id: 'F01-single-expense',
    why: 'Simplest case: one obligation before payday.',
    asOfDate: '2026-03-10', startingBalanceMinor: 200_000,
    events: [expense('e:rent', '2026-03-15', 115_000), income('i:pay', '2026-03-20', 141_255)],
    expect: { orderedIds: ['e:rent', 'i:pay'], balancesMinor: [85_000, 226_255], lowMinor: 85_000, lowDate: '2026-03-15', goesNegative: false },
  },
  {
    id: 'F02-no-expenses',
    why: 'Nothing scheduled: the low is today, not the payday balance.',
    asOfDate: '2026-03-10', startingBalanceMinor: 200_000,
    events: [income('i:pay', '2026-03-20', 141_255)],
    expect: { orderedIds: ['i:pay'], balancesMinor: [341_255], lowMinor: 200_000, lowDate: '2026-03-10', goesNegative: false },
  },
  {
    id: 'F03-exact-zero-low',
    why: 'Low lands on exactly zero. Must be zero, not -0 and not a rounding artefact.',
    asOfDate: '2026-03-10', startingBalanceMinor: 115_000,
    events: [expense('e:rent', '2026-03-15', 115_000), income('i:pay', '2026-03-20', 141_255)],
    expect: { orderedIds: ['e:rent', 'i:pay'], balancesMinor: [0, 141_255], lowMinor: 0, lowDate: '2026-03-15', goesNegative: false },
  },
  {
    id: 'F04-negative-low',
    why: 'Balance crosses zero before payday.',
    asOfDate: '2026-03-10', startingBalanceMinor: 100_000,
    events: [expense('e:rent', '2026-03-15', 115_000), income('i:pay', '2026-03-20', 141_255)],
    expect: { orderedIds: ['e:rent', 'i:pay'], balancesMinor: [-15_000, 126_255], lowMinor: -15_000, lowDate: '2026-03-15', goesNegative: true },
  },
  {
    id: 'F05-same-day-expense-then-income',
    why: 'Expenses apply before income on one date, so the intraday dip is visible.',
    asOfDate: '2026-03-10', startingBalanceMinor: 50_000,
    events: [income('i:pay', '2026-03-15', 141_255), expense('e:rent', '2026-03-15', 115_000)],
    expect: { orderedIds: ['e:rent', 'i:pay'], balancesMinor: [-65_000, 76_255], lowMinor: -65_000, lowDate: '2026-03-15', goesNegative: true },
  },
  {
    id: 'F06-same-day-largest-outflow-first',
    why: 'Within one date and kind, the larger outflow applies first.',
    asOfDate: '2026-03-10', startingBalanceMinor: 100_000,
    events: [expense('e:small', '2026-03-12', 1_000), expense('e:large', '2026-03-12', 40_000), expense('e:mid', '2026-03-12', 10_000), income('i:pay', '2026-03-20', 100_000)],
    expect: { orderedIds: ['e:large', 'e:mid', 'e:small', 'i:pay'], balancesMinor: [60_000, 50_000, 49_000, 149_000], lowMinor: 49_000, lowDate: '2026-03-12', goesNegative: false },
  },
  {
    id: 'F07-same-day-tie-breaks-on-id',
    why: 'Identical amounts on one date order by id, so the result is stable.',
    asOfDate: '2026-03-10', startingBalanceMinor: 100_000,
    events: [expense('e:bbb', '2026-03-12', 5_000), expense('e:aaa', '2026-03-12', 5_000), income('i:pay', '2026-03-20', 100_000)],
    expect: { orderedIds: ['e:aaa', 'e:bbb', 'i:pay'], balancesMinor: [95_000, 90_000, 190_000], lowMinor: 90_000, lowDate: '2026-03-12', goesNegative: false },
  },
  {
    id: 'F08-event-on-as-of-date-excluded',
    why: 'Today is already spent: a predicted event dated today is not in the window.',
    asOfDate: '2026-03-10', startingBalanceMinor: 100_000,
    events: [expense('e:today', '2026-03-10', 20_000), expense('e:future', '2026-03-12', 5_000), income('i:pay', '2026-03-20', 100_000)],
    expect: { orderedIds: ['e:future', 'i:pay'], balancesMinor: [95_000, 195_000], lowMinor: 95_000, lowDate: '2026-03-12', goesNegative: false },
  },
  {
    id: 'F09-after-payday-excluded',
    why: 'The horizon is payday; later obligations are out of scope.',
    asOfDate: '2026-03-10', startingBalanceMinor: 100_000,
    events: [expense('e:soon', '2026-03-12', 5_000), income('i:pay', '2026-03-20', 100_000), expense('e:later', '2026-03-25', 90_000)],
    expect: { orderedIds: ['e:soon', 'i:pay'], balancesMinor: [95_000, 195_000], lowMinor: 95_000, lowDate: '2026-03-12', goesNegative: false },
  },
  {
    id: 'F10-no-income-fallback-window',
    why: 'With no income the window is a fixed 35 days and the low spans it.',
    asOfDate: '2026-03-10', startingBalanceMinor: 100_000,
    events: [expense('e:a', '2026-03-20', 30_000), expense('e:b', '2026-04-20', 90_000)],
    expect: { orderedIds: ['e:a'], balancesMinor: [70_000], lowMinor: 70_000, lowDate: '2026-03-20', goesNegative: false },
  },
  {
    id: 'F11-secondary-income-counts',
    why: 'A non-primary deposit inside the window lifts the running balance.',
    asOfDate: '2026-03-10', startingBalanceMinor: 50_000,
    events: [expense('e:rent', '2026-03-12', 60_000), income('i:side', '2026-03-14', 20_000, false), income('i:pay', '2026-03-20', 100_000)],
    expect: { orderedIds: ['e:rent', 'i:side', 'i:pay'], balancesMinor: [-10_000, 10_000, 110_000], lowMinor: -10_000, lowDate: '2026-03-12', goesNegative: true },
  },
  {
    id: 'F12-month-end-jan-to-feb',
    why: 'A 31st obligation rolling into February must clamp, not skip a month.',
    asOfDate: '2026-01-30', startingBalanceMinor: 150_000,
    events: [expense('e:rent', '2026-02-28', 100_000), income('i:pay', '2026-03-01', 120_000)],
    expect: { orderedIds: ['e:rent', 'i:pay'], balancesMinor: [50_000, 170_000], lowMinor: 50_000, lowDate: '2026-02-28', goesNegative: false },
  },
  {
    id: 'F13-leap-day',
    why: 'February 29 in a leap year is a real date and must be ordered normally.',
    asOfDate: '2028-02-27', startingBalanceMinor: 80_000,
    events: [expense('e:rent', '2028-02-29', 50_000), income('i:pay', '2028-03-01', 90_000)],
    expect: { orderedIds: ['e:rent', 'i:pay'], balancesMinor: [30_000, 120_000], lowMinor: 30_000, lowDate: '2028-02-29', goesNegative: false },
  },
  {
    id: 'F14-year-boundary',
    why: 'The window crosses 31 December into January.',
    asOfDate: '2026-12-28', startingBalanceMinor: 90_000,
    events: [expense('e:rent', '2026-12-31', 40_000), expense('e:gym', '2027-01-02', 2_500), income('i:pay', '2027-01-05', 120_000)],
    expect: { orderedIds: ['e:rent', 'e:gym', 'i:pay'], balancesMinor: [50_000, 47_500, 167_500], lowMinor: 47_500, lowDate: '2027-01-02', goesNegative: false },
  },
  {
    id: 'F15-one-cent-amounts',
    why: 'Single-cent movements must survive exactly.',
    asOfDate: '2026-03-10', startingBalanceMinor: 100,
    events: [expense('e:a', '2026-03-11', 1), expense('e:b', '2026-03-12', 1), income('i:pay', '2026-03-13', 1)],
    expect: { orderedIds: ['e:a', 'e:b', 'i:pay'], balancesMinor: [99, 98, 99], lowMinor: 98, lowDate: '2026-03-12', goesNegative: false },
  },
  {
    id: 'F16-large-amounts',
    why: 'Six-figure balances stay exact in integer cents.',
    asOfDate: '2026-03-10', startingBalanceMinor: 99_999_999,
    events: [expense('e:a', '2026-03-11', 12_345_678), income('i:pay', '2026-03-20', 87_654_321)],
    expect: { orderedIds: ['e:a', 'i:pay'], balancesMinor: [87_654_321, 175_308_642], lowMinor: 87_654_321, lowDate: '2026-03-11', goesNegative: false },
  },
  {
    id: 'F17-starting-balance-is-the-low',
    why: 'When every event is a deposit, the low is today.',
    asOfDate: '2026-03-10', startingBalanceMinor: 40_000,
    events: [income('i:side', '2026-03-12', 5_000, false), income('i:pay', '2026-03-20', 100_000)],
    expect: { orderedIds: ['i:side', 'i:pay'], balancesMinor: [45_000, 145_000], lowMinor: 40_000, lowDate: '2026-03-10', goesNegative: false },
  },
  {
    id: 'F18-already-negative-start',
    why: 'An overdrawn account stays overdrawn through the window.',
    asOfDate: '2026-03-10', startingBalanceMinor: -5_000,
    events: [expense('e:a', '2026-03-12', 1_000), income('i:pay', '2026-03-20', 100_000)],
    expect: { orderedIds: ['e:a', 'i:pay'], balancesMinor: [-6_000, 94_000], lowMinor: -6_000, lowDate: '2026-03-12', goesNegative: true },
  },
  {
    id: 'F19-scenario-on-as-of-date',
    why: 'A purchase considered today is not yet spent, so it IS in the window.',
    asOfDate: '2026-03-10', startingBalanceMinor: 100_000,
    events: [expense('e:rent', '2026-03-15', 50_000), income('i:pay', '2026-03-20', 100_000)],
    scenario: { date: '2026-03-10', amountMinor: 35_000 },
    expect: { orderedIds: ['scenario', 'e:rent', 'i:pay'], balancesMinor: [65_000, 15_000, 115_000], lowMinor: 15_000, lowDate: '2026-03-15', goesNegative: false },
  },
  {
    id: 'F20-scenario-on-payday',
    why: 'A scenario dated on payday applies before the deposit, so it still moves the low.',
    asOfDate: '2026-03-10', startingBalanceMinor: 100_000,
    events: [expense('e:rent', '2026-03-15', 50_000), income('i:pay', '2026-03-20', 100_000)],
    scenario: { date: '2026-03-20', amountMinor: 20_000 },
    expect: { orderedIds: ['e:rent', 'scenario', 'i:pay'], balancesMinor: [50_000, 30_000, 130_000], lowMinor: 30_000, lowDate: '2026-03-20', goesNegative: false },
  },
  {
    id: 'F21-scenario-after-low-moves-less',
    why: 'A scenario after the dip need not move the low by its full amount.',
    asOfDate: '2026-03-10', startingBalanceMinor: 100_000,
    events: [expense('e:rent', '2026-03-12', 90_000), income('i:side', '2026-03-14', 80_000, false), income('i:pay', '2026-03-20', 100_000)],
    scenario: { date: '2026-03-16', amountMinor: 50_000 },
    expect: { orderedIds: ['e:rent', 'i:side', 'scenario', 'i:pay'], balancesMinor: [10_000, 90_000, 40_000, 140_000], lowMinor: 10_000, lowDate: '2026-03-12', goesNegative: false },
  },
  {
    id: 'F22-scenario-same-day-as-expense',
    why: 'A scenario sharing a date with an obligation orders by amount, largest first.',
    asOfDate: '2026-03-10', startingBalanceMinor: 100_000,
    events: [expense('e:rent', '2026-03-12', 60_000), income('i:pay', '2026-03-20', 100_000)],
    scenario: { date: '2026-03-12', amountMinor: 20_000 },
    expect: { orderedIds: ['e:rent', 'scenario', 'i:pay'], balancesMinor: [40_000, 20_000, 120_000], lowMinor: 20_000, lowDate: '2026-03-12', goesNegative: false },
  },
]
