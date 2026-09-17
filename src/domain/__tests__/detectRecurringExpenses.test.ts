import { describe, expect, it } from 'vitest'
import { detectRecurringExpenses } from '../detectRecurringExpenses'
import { txns } from './testHelpers'

const AS_OF = '2026-09-16'

describe('detectRecurringExpenses', () => {
  it('detects a monthly recurring expense and projects the next date', () => {
    const predictions = detectRecurringExpenses(
      txns([
        ['2026-07-01', 'CEDAR RIDGE APTS RENT', -1150, 'Housing'],
        ['2026-08-01', 'CEDAR RIDGE APTS RENT', -1150, 'Housing'],
        ['2026-09-01', 'CEDAR RIDGE APTS RENT', -1150, 'Housing'],
      ]),
      AS_OF,
    )

    expect(predictions).toHaveLength(1)
    expect(predictions[0]).toMatchObject({
      id: 'expense:cedar ridge apts rent',
      kind: 'expense',
      displayName: 'Cedar Ridge Apts Rent',
      amount: -1150,
      date: '2026-10-01',
      source: 'detected',
    })
    expect(predictions[0].evidence?.confidence).toBe('high')
    expect(predictions[0].evidence?.transactions).toHaveLength(3)
    expect(predictions[0].evidence?.cadence).toBe('monthly')
  })

  it('uses the median amount when charges vary within the allowed band', () => {
    const [prediction] = detectRecurringExpenses(
      txns([
        ['2026-06-15', 'CHASE CARD PAYMENT 4421', -276.9],
        ['2026-07-15', 'CHASE CARD PAYMENT 4421', -298.42],
        ['2026-08-15', 'CHASE CARD PAYMENT 4421', -312.15],
      ]),
      AS_OF,
    )

    expect(prediction.amount).toBe(-298.42)
    expect(prediction.evidence?.confidence).toBe('medium')
  })

  it('does not predict one-off and irregular purchases', () => {
    const predictions = detectRecurringExpenses(
      txns([
        ['2026-07-04', 'REI ADVENTURE OUTFITTERS #88', -142.37],
        ['2026-07-11', 'STARBUCKS 00291', -6.45],
        ['2026-07-19', 'STARBUCKS 00291', -5.1],
        ['2026-07-26', 'STARBUCKS 00291', -7.8],
        ['2026-08-02', 'STARBUCKS 00291', -4.95],
      ]),
      AS_OF,
    )

    expect(predictions).toEqual([])
  })

  it('rejects a merchant whose amount varies by more than the threshold', () => {
    const predictions = detectRecurringExpenses(
      txns([
        ['2026-06-10', 'CITY POWER CO', -80],
        ['2026-07-10', 'CITY POWER CO', -100],
        ['2026-08-10', 'CITY POWER CO', -140],
      ]),
      AS_OF,
    )

    expect(predictions).toEqual([])
  })

  it('accepts amount variation just inside the 20% threshold', () => {
    // 108 - 92 = 16 over a mean of 100 => exactly 16% spread.
    const predictions = detectRecurringExpenses(
      txns([
        ['2026-06-10', 'CITY POWER CO', -92],
        ['2026-07-10', 'CITY POWER CO', -100],
        ['2026-08-10', 'CITY POWER CO', -108],
      ]),
      AS_OF,
    )

    expect(predictions).toHaveLength(1)
  })

  it('resolves an even-count half-cent median by a stated rule', () => {
    // Two occurrences a cent apart put the median exactly on a half-cent.
    // Averaging in dollars would let the binary representation decide it.
    const [prediction] = detectRecurringExpenses(
      txns([
        ['2026-08-12', 'ACME SUPPLY', -10.01],
        ['2026-09-12', 'ACME SUPPLY', -10.02],
      ]),
      AS_OF,
    )

    expect(prediction.amount).toBe(-10.02)
  })

  it('rejects a single occurrence as insufficient history', () => {
    const predictions = detectRecurringExpenses(
      txns([['2026-08-01', 'CEDAR RIDGE APTS RENT', -1150]]),
      AS_OF,
    )

    expect(predictions).toEqual([])
  })

  it('accepts two occurrences but labels the prediction low confidence', () => {
    const [prediction] = detectRecurringExpenses(
      txns([
        ['2026-08-12', 'SPOTIFY USA 877-778-1161', -11.99],
        ['2026-09-12', 'SPOTIFY USA 877-778-1161', -11.99],
      ]),
      AS_OF,
    )

    expect(prediction.evidence?.confidence).toBe('low')
    expect(prediction.evidence?.confidenceReason).toContain('2 previous payments')
    expect(prediction.date).toBe('2026-10-12')
  })

  it('ignores duplicate postings instead of treating them as a zero-day gap', () => {
    const predictions = detectRecurringExpenses(
      txns([
        ['2026-07-08', 'XFINITY INTERNET 8009345', -64.99],
        ['2026-08-08', 'XFINITY INTERNET 8009345', -64.99],
        ['2026-08-08', 'XFINITY INTERNET 8009345', -64.99],
        ['2026-09-08', 'XFINITY INTERNET 8009345', -64.99],
      ]),
      AS_OF,
    )

    expect(predictions).toHaveLength(1)
    expect(predictions[0].evidence?.transactions).toHaveLength(3)
    expect(predictions[0].evidence?.intervalsDays).toEqual([31, 31])
  })

  it('keeps similar but different merchants apart', () => {
    const predictions = detectRecurringExpenses(
      txns([
        ['2026-07-02', 'CEDAR RIDGE APTS RENT', -1150],
        ['2026-08-02', 'CEDAR RIDGE APTS RENT', -1150],
        ['2026-07-03', 'CEDAR RIDGE STORAGE', -75],
        ['2026-08-03', 'CEDAR RIDGE STORAGE', -75],
      ]),
      AS_OF,
    )

    expect(predictions).toHaveLength(2)
    expect(predictions.map((prediction) => prediction.displayName).sort()).toEqual([
      'Cedar Ridge Apts Rent',
      'Cedar Ridge Storage',
    ])
  })

  it('groups the same biller across noisy descriptors', () => {
    const predictions = detectRecurringExpenses(
      txns([
        ['2026-07-12', 'SPOTIFY USA 877-778-1161', -11.99],
        ['2026-08-12', 'SPOTIFY USA', -11.99],
        ['2026-09-12', 'spotify usa 8777781161', -11.99],
      ]),
      AS_OF,
    )

    expect(predictions).toHaveLength(1)
    expect(predictions[0].displayName).toBe('Spotify')
  })

  it('rejects a merchant whose gaps straddle the monthly window', () => {
    // Median is 30 days, but a 5-day gap means this is not a monthly bill.
    const predictions = detectRecurringExpenses(
      txns([
        ['2026-06-01', 'ACME SUPPLY', -50],
        ['2026-06-06', 'ACME SUPPLY', -50],
        ['2026-07-06', 'ACME SUPPLY', -50],
        ['2026-08-30', 'ACME SUPPLY', -50],
      ]),
      AS_OF,
    )

    expect(predictions).toEqual([])
  })

  it('ignores income when looking for recurring expenses', () => {
    const predictions = detectRecurringExpenses(
      txns([
        ['2026-07-01', 'NORTHGATE UNIV PAYROLL', 1412.55],
        ['2026-08-01', 'NORTHGATE UNIV PAYROLL', 1412.55],
        ['2026-09-01', 'NORTHGATE UNIV PAYROLL', 1412.55],
      ]),
      AS_OF,
    )

    expect(predictions).toEqual([])
  })

  it('rolls a missed bill forward to the next future date', () => {
    const [prediction] = detectRecurringExpenses(
      txns([
        ['2026-05-20', 'PLANET FITNESS #2231', -24.99],
        ['2026-06-20', 'PLANET FITNESS #2231', -24.99],
      ]),
      AS_OF,
    )

    // Last seen in June, as-of is mid-September: the next date must be ahead.
    expect(prediction.date > AS_OF).toBe(true)
    expect(prediction.date).toBe('2026-09-20')
  })

  it('returns predictions ordered by date', () => {
    const predictions = detectRecurringExpenses(
      txns([
        ['2026-07-20', 'PLANET FITNESS #2231', -24.99],
        ['2026-08-20', 'PLANET FITNESS #2231', -24.99],
        ['2026-07-01', 'CEDAR RIDGE APTS RENT', -1150],
        ['2026-08-01', 'CEDAR RIDGE APTS RENT', -1150],
      ]),
      AS_OF,
    )

    expect(predictions.map((prediction) => prediction.date)).toEqual([
      '2026-09-20',
      '2026-10-01',
    ])
  })
})
