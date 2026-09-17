/**
 * CSV parsing for FinAhead.
 *
 * Written by hand rather than pulled from a library because the accepted format
 * is one fixed four-column shape, and because the error messages are part of the
 * product: a user who exports the wrong file needs to be told exactly which
 * column is missing and exactly which row failed.
 *
 * The parser never repairs a value. If an amount or a date cannot be read with
 * certainty, the row is reported as an error and the file is rejected — silently
 * coercing a malformed number would put a wrong figure into a forecast the user
 * is about to rely on.
 */

import type { Transaction, ValidationError } from '../domain/types'
import { isValidIsoDate } from '../domain/dateUtils'
import { parseMoney } from '../domain/money'

export const REQUIRED_COLUMNS = ['date', 'merchant', 'amount', 'category'] as const

export interface CsvParseResult {
  /** Parsed rows, in file order. Empty whenever `errors` is non-empty. */
  transactions: Transaction[]
  /** Every problem found. A non-empty list means the file was not accepted. */
  errors: ValidationError[]
  /** Count of completely blank lines that were skipped. */
  skippedBlankRows: number
}

/**
 * Split CSV text into rows of fields, honouring double-quoted fields that may
 * contain commas, newlines and escaped (`""`) quotes.
 */
function tokenize(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      // Treat \r\n as one break.
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  row.push(field)
  rows.push(row)
  return rows
}

/** True when every cell in the row is empty or whitespace. */
function isBlankRow(row: string[]): boolean {
  return row.every((cell) => cell.trim() === '')
}

/**
 * Read a dollar amount. Accepts an optional `$` and thousands separators, both
 * of which are formatting rather than value. Anything else is an error.
 *
 * The conversion happens on the decimal digits (see `parseMoney`), so a value
 * written with sub-cent precision resolves by a stated rule rather than by
 * whichever way its binary approximation happens to fall.
 */
function parseAmount(raw: string): number | null {
  return parseMoney(raw)
}

export function parseCsv(text: string): CsvParseResult {
  const errors: ValidationError[] = []

  if (text.trim() === '') {
    return {
      transactions: [],
      errors: [
        {
          field: 'file',
          code: 'empty-file',
          message: 'That file is empty. Export a CSV that includes a header row and at least one transaction.',
        },
      ],
      skippedBlankRows: 0,
    }
  }

  const rows = tokenize(text)
  const headerRow = rows[0].map((cell) => cell.trim().toLowerCase())

  const columnIndex: Record<string, number> = {}
  for (const column of REQUIRED_COLUMNS) {
    columnIndex[column] = headerRow.indexOf(column)
  }

  const missing = REQUIRED_COLUMNS.filter((column) => columnIndex[column] === -1)
  if (missing.length > 0) {
    return {
      transactions: [],
      errors: missing.map((column) => ({
        field: column,
        code: 'missing-column',
        message: `This file has no "${column}" column. FinAhead needs date, merchant, amount and category columns.`,
      })),
      skippedBlankRows: 0,
    }
  }

  const transactions: Transaction[] = []
  let skippedBlankRows = 0

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index]
    const rowNumber = index + 1 // 1-based, counting the header

    if (isBlankRow(row)) {
      skippedBlankRows += 1
      continue
    }

    if (row.length < headerRow.length) {
      errors.push({
        field: 'row',
        code: 'malformed-row',
        row: rowNumber,
        message: `Row ${rowNumber} has ${row.length} values but the header defines ${headerRow.length}. Check for a missing comma.`,
      })
      continue
    }

    const date = (row[columnIndex.date] ?? '').trim()
    const merchant = (row[columnIndex.merchant] ?? '').trim()
    const rawAmount = row[columnIndex.amount] ?? ''
    const category = (row[columnIndex.category] ?? '').trim()

    let rowHasError = false

    if (!isValidIsoDate(date)) {
      errors.push({
        field: 'date',
        code: 'invalid-date',
        row: rowNumber,
        message: `Row ${rowNumber} has the date "${date}". Dates must be written as YYYY-MM-DD, for example 2026-09-01.`,
      })
      rowHasError = true
    }

    if (merchant === '') {
      errors.push({
        field: 'merchant',
        code: 'missing-merchant',
        row: rowNumber,
        message: `Row ${rowNumber} has no merchant. Every transaction needs a merchant so FinAhead can group repeat payments.`,
      })
      rowHasError = true
    }

    const amount = parseAmount(rawAmount)
    if (amount === null) {
      errors.push({
        field: 'amount',
        code: 'invalid-amount',
        row: rowNumber,
        message: `Row ${rowNumber} has the amount "${rawAmount.trim()}". Amounts must be numbers, negative for expenses and positive for income.`,
      })
      rowHasError = true
    }

    if (rowHasError || amount === null) continue

    transactions.push({
      id: `csv-${rowNumber}`,
      date,
      merchant,
      amount,
      category,
    })
  }

  if (errors.length === 0 && transactions.length === 0) {
    errors.push({
      field: 'file',
      code: 'no-transactions',
      message: 'That file has a valid header but no transaction rows.',
    })
  }

  return {
    // A file is accepted in full or not at all; partial data would produce a
    // forecast the user cannot reconcile against their statement.
    transactions: errors.length > 0 ? [] : transactions,
    errors,
    skippedBlankRows,
  }
}
