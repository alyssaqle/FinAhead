import { describe, expect, it } from 'vitest'
import { createManualIncomeEvent, detectIncome } from '../detectIncome'
import { txns } from './testHelpers'

const AS_OF = '2026-09-16'

describe('detectIncome', () => {
  it('detects a biweekly paycheck', () => {
    const { primary, candidates } = detectIncome(
      txns([
        ['2026-08-04', 'NORTHGATE UNIV PAYROLL', 1412.55],
        ['2026-08-18', 'NORTHGATE UNIV PAYROLL', 1398.2],
        ['2026-09-01', 'NORTHGATE UNIV PAYROLL', 1412.55],
        ['2026-09-15', 'NORTHGATE UNIV PAYROLL', 1421.08],
      ]),
      AS_OF,
    )

    expect(candidates).toHaveLength(1)
    expect(primary).toMatchObject({
      kind: 'income',
      displayName: 'Northgate Univ Payroll',
      date: '2026-09-29',
      isPrimaryIncome: true,
    })
    expect(primary?.evidence?.cadence).toBe('biweekly')
    expect(primary?.amount).toBe(1412.55)
  })

  it('detects monthly income', () => {
    const { primary } = detectIncome(
      txns([
        ['2026-07-01', 'STIPEND OFFICE', 2000],
        ['2026-08-01', 'STIPEND OFFICE', 2000],
        ['2026-09-01', 'STIPEND OFFICE', 2000],
      ]),
      AS_OF,
    )

    expect(primary?.evidence?.cadence).toBe('monthly')
    expect(primary?.date).toBe('2026-10-01')
  })

  it('ignores irregular positive deposits', () => {
    const { primary, candidates } = detectIncome(
      txns([
        ['2026-07-03', 'VENMO FROM MAYA', 40],
        ['2026-07-21', 'VENMO FROM MAYA', 15],
        ['2026-08-30', 'VENMO FROM MAYA', 120],
      ]),
      AS_OF,
    )

    expect(candidates).toEqual([])
    expect(primary).toBeNull()
  })

  it('rejects a deposit stream whose amounts vary too much', () => {
    const { candidates } = detectIncome(
      txns([
        ['2026-07-01', 'GIG PLATFORM', 300],
        ['2026-08-01', 'GIG PLATFORM', 900],
        ['2026-09-01', 'GIG PLATFORM', 550],
      ]),
      AS_OF,
    )

    expect(candidates).toEqual([])
  })

  it('picks the largest deposit stream when several qualify', () => {
    const { primary, candidates } = detectIncome(
      txns([
        ['2026-08-04', 'NORTHGATE UNIV PAYROLL', 1412.55],
        ['2026-08-18', 'NORTHGATE UNIV PAYROLL', 1398.2],
        ['2026-09-01', 'NORTHGATE UNIV PAYROLL', 1412.55],
        // A smaller monthly transfer that arrives sooner. It must not be
        // mistaken for the paycheck just because its next date is earlier.
        ['2026-07-05', 'ZELLE FROM PARENT', 200],
        ['2026-08-05', 'ZELLE FROM PARENT', 200],
        ['2026-09-05', 'ZELLE FROM PARENT', 200],
      ]),
      AS_OF,
    )

    expect(candidates).toHaveLength(2)
    expect(primary?.displayName).toBe('Northgate Univ Payroll')
    expect(candidates[0].isPrimaryIncome).toBe(true)
    expect(candidates[1].isPrimaryIncome).toBe(false)
    // The smaller stream is still reported so it can appear in the timeline.
    expect(candidates[1].displayName).toBe('Zelle From Parent')
  })

  it('resolves an even-count half-cent median by a stated rule', () => {
    const { primary } = detectIncome(
      txns([
        ['2026-08-18', 'NORTHGATE UNIV PAYROLL', 1412.55],
        ['2026-09-01', 'NORTHGATE UNIV PAYROLL', 1412.56],
      ]),
      AS_OF,
    )

    expect(primary?.amount).toBe(1412.56)
  })

  it('reports no income when there are no deposits at all', () => {
    const { primary, candidates } = detectIncome(
      txns([
        ['2026-07-01', 'CEDAR RIDGE APTS RENT', -1150],
        ['2026-08-01', 'CEDAR RIDGE APTS RENT', -1150],
      ]),
      AS_OF,
    )

    expect(candidates).toEqual([])
    expect(primary).toBeNull()
  })

  it('reports no income from a single deposit', () => {
    const { primary } = detectIncome(
      txns([['2026-09-01', 'NORTHGATE UNIV PAYROLL', 1412.55]]),
      AS_OF,
    )

    expect(primary).toBeNull()
  })

  it('collapses duplicate deposits before measuring the cadence', () => {
    const { primary } = detectIncome(
      txns([
        ['2026-08-04', 'NORTHGATE UNIV PAYROLL', 1412.55],
        ['2026-08-04', 'NORTHGATE UNIV PAYROLL', 1412.55],
        ['2026-08-18', 'NORTHGATE UNIV PAYROLL', 1412.55],
        ['2026-09-01', 'NORTHGATE UNIV PAYROLL', 1412.55],
      ]),
      AS_OF,
    )

    expect(primary?.evidence?.transactions).toHaveLength(3)
    expect(primary?.evidence?.intervalsDays).toEqual([14, 14])
  })

  it('rolls a stale pay schedule forward past the as-of date', () => {
    const { primary } = detectIncome(
      txns([
        ['2026-07-03', 'NORTHGATE UNIV PAYROLL', 1412.55],
        ['2026-07-17', 'NORTHGATE UNIV PAYROLL', 1412.55],
      ]),
      AS_OF,
    )

    expect(primary?.date).toBe('2026-09-25')
    expect(primary!.date > AS_OF).toBe(true)
  })

  it('builds a manual income event from user input', () => {
    const event = createManualIncomeEvent('2026-09-30', 1200)

    expect(event).toMatchObject({
      id: 'income:manual',
      kind: 'income',
      amount: 1200,
      date: '2026-09-30',
      source: 'user-manual',
      isPrimaryIncome: true,
      evidence: null,
    })
  })

  it('treats a manual amount as an inflow even if entered negative', () => {
    expect(createManualIncomeEvent('2026-09-30', -1200).amount).toBe(1200)
  })
})
