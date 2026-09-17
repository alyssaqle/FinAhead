import { describe, expect, it } from 'vitest'
import { normalizeMerchant, normalizeTransactions } from '../normalizeMerchant'

describe('normalizeMerchant', () => {
  it('resolves known aliases to a clean display name', () => {
    expect(normalizeMerchant('SPOTIFY USA 877-778-1161').display).toBe('Spotify')
    expect(normalizeMerchant('NETFLIX.COM').display).toBe('Netflix')
    expect(normalizeMerchant('XFINITY INTERNET 8009345').display).toBe(
      'Xfinity Internet',
    )
    expect(normalizeMerchant('CHASE CARD PAYMENT 4421').display).toBe(
      'Chase Credit Card',
    )
  })

  it('maps different descriptors for the same biller to one key', () => {
    const forms = [
      'SPOTIFY USA 877-778-1161',
      'SPOTIFY USA',
      'spotify usa 8777781161',
      'Spotify',
    ]
    const keys = new Set(forms.map((form) => normalizeMerchant(form).key))

    expect(keys.size).toBe(1)
    expect([...keys][0]).toBe('spotify')
  })

  it('prefers the longest matching alias', () => {
    expect(normalizeMerchant('UBER EATS 8842').display).toBe('Uber Eats')
    expect(normalizeMerchant('UBER *TRIP 8842').display).toBe('Uber')
  })

  it('collapses extra and leading/trailing whitespace', () => {
    const spaced = normalizeMerchant("  TRADER JOE'S   #455  ")
    const tight = normalizeMerchant("TRADER JOE'S #455")

    expect(spaced.key).toBe(tight.key)
    expect(spaced.display).toBe("Trader Joe's")
  })

  it('strips transaction and store identifiers', () => {
    expect(normalizeMerchant('CAMPUS BOOKSTORE #88231').display).toBe(
      'Campus Bookstore',
    )
    expect(normalizeMerchant('CAMPUS BOOKSTORE 88231').key).toBe(
      normalizeMerchant('CAMPUS BOOKSTORE').key,
    )
    expect(normalizeMerchant('WALGREENS XX4471').key).toBe('walgreens')
  })

  it('strips phone numbers in common formats', () => {
    expect(normalizeMerchant('ACME SUPPLY 877-778-1161').key).toBe('acme supply')
    expect(normalizeMerchant('ACME SUPPLY 877.778.1161').key).toBe('acme supply')
    expect(normalizeMerchant('ACME SUPPLY (877) 778-1161').key).toBe('acme supply')
  })

  it('keeps digits that are part of a name', () => {
    expect(normalizeMerchant('7-ELEVEN').display).toBe('7-Eleven')
    expect(normalizeMerchant('STUDIO 54 SALON').display).toBe('Studio 54 Salon')
  })

  it('ignores case differences when grouping', () => {
    expect(normalizeMerchant('netflix.com').key).toBe(
      normalizeMerchant('NETFLIX.COM').key,
    )
    expect(normalizeMerchant('cedar ridge apts rent').key).toBe(
      normalizeMerchant('CEDAR RIDGE APTS RENT').key,
    )
  })

  it('title-cases an unrecognised merchant and keeps short acronyms', () => {
    expect(normalizeMerchant('CEDAR RIDGE APTS RENT').display).toBe(
      'Cedar Ridge Apts Rent',
    )
    expect(normalizeMerchant('REI ADVENTURE OUTFITTERS #88').display).toBe(
      'REI Adventure Outfitters',
    )
  })

  it('drops payment-network prefixes', () => {
    expect(normalizeMerchant('POS DEBIT SAFEWAY 1123').key).toBe('safeway')
    expect(normalizeMerchant('SQ *BLUE BOTTLE').display).toBe('Blue Bottle')
  })

  it('falls back to the original descriptor when nothing survives cleaning', () => {
    const result = normalizeMerchant('#889231')

    expect(result.display).toBe('#889231')
    expect(result.key).toBe('#889231')
  })

  it('handles an empty descriptor without throwing', () => {
    expect(normalizeMerchant('').display).toBe('Unknown merchant')
    expect(normalizeMerchant('   ').display).toBe('Unknown merchant')
  })

  it('attaches normalisation to a list of transactions', () => {
    const [first] = normalizeTransactions([
      { merchant: 'SPOTIFY USA 877-778-1161', amount: -11.99 },
    ])

    expect(first).toMatchObject({
      normalizedMerchant: 'Spotify',
      merchantKey: 'spotify',
      amount: -11.99,
    })
  })
})
