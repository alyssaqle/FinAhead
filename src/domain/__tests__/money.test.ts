/**
 * Money representation tests.
 *
 * These pin the two guarantees FinAhead's figures rest on: that decimal text
 * becomes cents exactly, and that rounding is symmetric and stated rather than
 * inherited from `Math.round`'s behaviour on halves.
 */

import { describe, expect, it } from 'vitest'
import {
  formatCurrency,
  medianMoney,
  parseMoney,
  parseMoneyToCents,
  roundMoney,
  toCents,
} from '../money'

describe('parseMoneyToCents', () => {
  it('converts plain decimals exactly', () => {
    expect(parseMoneyToCents('1150.00')).toBe(115000)
    expect(parseMoneyToCents('-1150')).toBe(-115000)
    expect(parseMoneyToCents('0.01')).toBe(1)
    expect(parseMoneyToCents('11.99')).toBe(1199)
    expect(parseMoneyToCents('+42.5')).toBe(4250)
  })

  it('treats currency symbols, separators and spaces as formatting', () => {
    expect(parseMoneyToCents('$1,412.55')).toBe(141255)
    expect(parseMoneyToCents('-$1,150.00')).toBe(-115000)
    expect(parseMoneyToCents('  2140  ')).toBe(214000)
  })

  it('rounds a sub-cent amount half away from zero, from the digits', () => {
    // The value 10.005 is the double 10.00499999999999989…, so anything that
    // parses it into a number first rounds it down. Reading the digits does not.
    expect(parseMoneyToCents('10.005')).toBe(1001)
    expect(parseMoneyToCents('-10.005')).toBe(-1001)
    expect(parseMoneyToCents('10.004')).toBe(1000)
    expect(parseMoneyToCents('10.0049')).toBe(1000)
    expect(parseMoneyToCents('10.00501')).toBe(1001)
  })

  it('rounds the same magnitude the same way regardless of sign', () => {
    for (const text of ['0.005', '2.675', '127.995', '46.925']) {
      expect(parseMoneyToCents(`-${text}`)).toBe(-parseMoneyToCents(text)!)
    }
  })

  it('rejects anything that is not a plain decimal number', () => {
    for (const text of ['', '   ', 'abc', '1e3', '1.2.3', '--5', '(50)', '5%', '1/2']) {
      expect(parseMoneyToCents(text)).toBeNull()
    }
  })

  it('rejects an amount too large to hold exactly in cents', () => {
    expect(parseMoneyToCents('999999999999999999')).toBeNull()
  })

  it('never returns negative zero', () => {
    expect(Object.is(parseMoneyToCents('-0.00'), 0)).toBe(true)
    expect(Object.is(parseMoney('-0.001')!, 0)).toBe(true)
  })
})

describe('parseMoney', () => {
  it('returns dollars', () => {
    expect(parseMoney('1,412.55')).toBe(1412.55)
    expect(parseMoney('-64.99')).toBe(-64.99)
    expect(parseMoney('nope')).toBeNull()
  })

  it('round-trips every cent value in a representative range', () => {
    for (let cents = -5000; cents <= 5000; cents += 1) {
      const text = (cents / 100).toFixed(2)
      expect(toCents(parseMoney(text)!)).toBe(cents)
    }
  })
})

describe('toCents and roundMoney', () => {
  it('strips the floating-point noise left by addition', () => {
    expect(2.51 + 0.01).not.toBe(2.52)
    expect(roundMoney(2.51 + 0.01)).toBe(2.52)
    expect(roundMoney(990 + -259.99)).toBe(730.01)
    expect(toCents(730.0100000000001)).toBe(73001)
  })

  it('rounds halves away from zero, symmetrically', () => {
    // Math.round alone rounds halves toward +Infinity, which would split these.
    expect(toCents(0.125)).toBe(13)
    expect(toCents(-0.125)).toBe(-13)
    expect(roundMoney(2.345)).toBe(2.35)
    expect(roundMoney(-2.345)).toBe(-2.35)
  })

  it('never returns negative zero', () => {
    expect(Object.is(roundMoney(-0.0001), 0)).toBe(true)
    expect(Object.is(toCents(-0), 0)).toBe(true)
  })

  it('keeps a running balance exact against an integer-cent reference', () => {
    const amounts = [-1150, -259.99, -24.99, -30, -145]
    let balance = 2140
    let cents = 214000
    for (const amount of amounts) {
      balance = roundMoney(balance + amount)
      cents += toCents(amount)
      expect(toCents(balance)).toBe(cents)
    }
    expect(balance).toBe(530.02)
  })
})

describe('medianMoney', () => {
  it('returns the middle value for an odd-length list', () => {
    expect(medianMoney([10.01, 10.02, 10.03])).toBe(10.02)
    expect(medianMoney([-5.5])).toBe(-5.5)
  })

  it('resolves an even-length half-cent midpoint half away from zero', () => {
    // The midpoint of these is exactly half a cent. Averaging in dollars lets
    // the binary representation decide; averaging in cents does not.
    expect(medianMoney([10.01, 10.02])).toBe(10.02)
    expect(medianMoney([2.01, 2.02])).toBe(2.02)
    expect(medianMoney([-10.01, -10.02])).toBe(-10.02)
  })

  it('averages an even-length list that lands on a whole cent', () => {
    expect(medianMoney([10.0, 10.02])).toBe(10.01)
    expect(medianMoney([100, 200, 300, 400])).toBe(250)
  })

  it('is order independent', () => {
    expect(medianMoney([10.02, 10.01])).toBe(medianMoney([10.01, 10.02]))
  })

  it('returns 0 for an empty list', () => {
    expect(medianMoney([])).toBe(0)
  })
})

describe('formatting stays separate from calculation', () => {
  it('formats without changing the value', () => {
    const value = roundMoney(530.02)
    expect(formatCurrency(value)).toBe('$530.02')
    expect(value).toBe(530.02)
    expect(formatCurrency(-1150)).toBe('-$1,150.00')
  })
})
