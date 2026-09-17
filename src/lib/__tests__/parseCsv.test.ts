import { describe, expect, it } from 'vitest'
import { parseCsv } from '../parseCsv'

const HEADER = 'date,merchant,amount,category'

describe('parseCsv', () => {
  it('parses a valid file', () => {
    const result = parseCsv(
      [
        HEADER,
        '2026-09-01,CEDAR RIDGE APTS RENT,-1150.00,Housing',
        '2026-09-04,NORTHGATE UNIV PAYROLL,1412.55,Income',
        '2026-09-06,SAFEWAY 1123,-47.20,',
      ].join('\n'),
    )

    expect(result.errors).toEqual([])
    expect(result.transactions).toHaveLength(3)
    expect(result.transactions[0]).toMatchObject({
      date: '2026-09-01',
      merchant: 'CEDAR RIDGE APTS RENT',
      amount: -1150,
      category: 'Housing',
    })
    // A blank category is allowed; the column just has to exist.
    expect(result.transactions[2].category).toBe('')
  })

  it('accepts quoted fields containing commas', () => {
    const result = parseCsv(
      [HEADER, '2026-09-01,"JOE\'S BAGELS, LLC",-12.50,Dining'].join('\n'),
    )

    expect(result.errors).toEqual([])
    expect(result.transactions[0].merchant).toBe("JOE'S BAGELS, LLC")
  })

  it('accepts dollar signs and thousands separators as formatting', () => {
    const result = parseCsv(
      [HEADER, '2026-09-01,RENT,"-$1,150.00",Housing'].join('\n'),
    )

    expect(result.errors).toEqual([])
    expect(result.transactions[0].amount).toBe(-1150)
  })

  it('converts amounts to cents exactly, without a float round trip', () => {
    const result = parseCsv(
      [
        HEADER,
        '2026-09-01,A,-1150.00,Housing',
        '2026-09-02,B,0.01,X',
        '2026-09-03,C,1412.55,Income',
      ].join('\n'),
    )

    expect(result.errors).toEqual([])
    expect(result.transactions.map((t) => t.amount)).toEqual([-1150, 0.01, 1412.55])
  })

  it('rounds a sub-cent amount half away from zero by a stated rule', () => {
    // Reading the digits rather than parsing to a double first: 10.005 is the
    // double 10.00499999999999989…, which would otherwise resolve to 10.00.
    const result = parseCsv(
      [HEADER, '2026-09-01,A,10.005,X', '2026-09-02,B,-10.005,X'].join('\n'),
    )

    expect(result.errors).toEqual([])
    expect(result.transactions.map((t) => t.amount)).toEqual([10.01, -10.01])
  })

  it('still rejects amounts that are not plain decimal numbers', () => {
    for (const value of ['1e3', '1.2.3', '(50)', '5%']) {
      const result = parseCsv([HEADER, `2026-09-01,A,${value},X`].join('\n'))
      expect(result.errors[0].code).toBe('invalid-amount')
    }
  })

  it('rejects a file that is missing a required column', () => {
    const result = parseCsv(
      ['date,merchant,amount', '2026-09-01,RENT,-1150.00'].join('\n'),
    )

    expect(result.transactions).toEqual([])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].code).toBe('missing-column')
    expect(result.errors[0].message).toContain('category')
  })

  it('reports every missing column, not just the first', () => {
    const result = parseCsv(['date,amount', '2026-09-01,-1150.00'].join('\n'))

    expect(result.errors.map((error) => error.field).sort()).toEqual([
      'category',
      'merchant',
    ])
  })

  it('reports an invalid date and keeps the row out of the results', () => {
    const result = parseCsv(
      [
        HEADER,
        '09/01/2026,RENT,-1150.00,Housing',
        '2026-09-04,PAYROLL,1412.55,Income',
      ].join('\n'),
    )

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({
      code: 'invalid-date',
      field: 'date',
      row: 2,
    })
    // The file is rejected as a whole rather than partially imported.
    expect(result.transactions).toEqual([])
  })

  it('rejects a date that is well formed but not a real day', () => {
    const result = parseCsv([HEADER, '2026-02-30,RENT,-1150.00,Housing'].join('\n'))

    expect(result.errors[0].code).toBe('invalid-date')
  })

  it('reports a nonnumeric amount', () => {
    const result = parseCsv(
      [HEADER, '2026-09-01,RENT,one thousand,Housing'].join('\n'),
    )

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ code: 'invalid-amount', row: 2 })
    expect(result.errors[0].message).toContain('one thousand')
  })

  it('reports a blank amount rather than treating it as zero', () => {
    const result = parseCsv([HEADER, '2026-09-01,RENT,,Housing'].join('\n'))

    expect(result.errors[0].code).toBe('invalid-amount')
  })

  it('ignores completely blank rows', () => {
    const result = parseCsv(
      [
        HEADER,
        '2026-09-01,RENT,-1150.00,Housing',
        '',
        ',,,',
        '   ',
        '2026-09-04,PAYROLL,1412.55,Income',
      ].join('\n'),
    )

    expect(result.errors).toEqual([])
    expect(result.transactions).toHaveLength(2)
    expect(result.skippedBlankRows).toBe(3)
  })

  it('reports an empty file', () => {
    expect(parseCsv('').errors[0].code).toBe('empty-file')
    expect(parseCsv('   \n  \n').errors[0].code).toBe('empty-file')
  })

  it('reports a header with no transaction rows', () => {
    const result = parseCsv(`${HEADER}\n`)

    expect(result.transactions).toEqual([])
    expect(result.errors[0].code).toBe('no-transactions')
  })

  it('reports a row with too few values', () => {
    const result = parseCsv([HEADER, '2026-09-01,RENT,-1150.00'].join('\n'))

    expect(result.errors[0]).toMatchObject({ code: 'malformed-row', row: 2 })
  })

  it('reports a missing merchant', () => {
    const result = parseCsv([HEADER, '2026-09-01,,-1150.00,Housing'].join('\n'))

    expect(result.errors[0].code).toBe('missing-merchant')
  })

  it('accepts columns in any order and ignores extra columns', () => {
    const result = parseCsv(
      [
        'category,amount,merchant,date,memo',
        'Housing,-1150.00,RENT,2026-09-01,autopay',
      ].join('\n'),
    )

    expect(result.errors).toEqual([])
    expect(result.transactions[0]).toMatchObject({
      date: '2026-09-01',
      merchant: 'RENT',
      amount: -1150,
      category: 'Housing',
    })
  })

  it('handles CRLF line endings', () => {
    const result = parseCsv(
      `${HEADER}\r\n2026-09-01,RENT,-1150.00,Housing\r\n`,
    )

    expect(result.errors).toEqual([])
    expect(result.transactions).toHaveLength(1)
  })
})
