/**
 * MoneyData -> FinAhead schema adapter.
 *
 * Source: "Bank Transactions Dataset" (MoneyData), Robert Laramee,
 * University of Nottingham, v1, 2026-01-14. DOI 10.17632/dnxtg6n4rv.1
 * Licence: CC BY 4.0.
 *
 * The adapter is read-only and lives entirely in the benchmark. It does not
 * import or alter any FinAhead production code; it only produces a CSV in the
 * schema FinAhead's own parser already accepts, so the parser is exercised
 * exactly as it is in the product.
 *
 * ---------------------------------------------------------------------------
 * COLUMN SEMANTICS (determined from raw cell refs, not column order)
 * ---------------------------------------------------------------------------
 * The published header is:
 *   A Transaction Number | B Transaction Date | C Transaction Type
 *   D Transaction Description | E Debit Amount | F Credit Amount
 *   G Balance | H Category | I Location City | J Location Country
 *
 * The cell data does not follow that header. Inspecting raw refs shows two
 * shapes, and no row ever has both F and G:
 *
 *   E present, F present, G absent   (6,122 rows)
 *   E present, F absent,  G present    (445 rows)
 *
 * In both shapes E holds the transaction magnitude. The running balance is in
 * whichever of F/G is populated. The balance chain reconciles only if the
 * first shape is read as a DEBIT and the second as a CREDIT, which is also
 * consistent with the transaction types and categories on those rows (the
 * second shape is dominated by FPI/BGC/DEP with income-like categories).
 *
 * So direction is inferred from which balance column is populated:
 *   F populated -> money out (negative)
 *   G populated -> money in  (positive)
 *
 * This inference is not assumed — `evaluate.mjs` reconciles the whole chain
 * against the dataset's own balances and reports the exact-match rate.
 *
 * ---------------------------------------------------------------------------
 * OTHER TRANSFORMATIONS
 * ---------------------------------------------------------------------------
 * Date       Either "DD/MM/YYYY" (UK order) or an Excel serial number. Both are
 *            converted to ISO YYYY-MM-DD in UTC. Rows whose date is neither are
 *            rejected, never guessed.
 * Merchant   Column D verbatim. It is deliberately NOT cleaned here, so that
 *            FinAhead's own normaliser is the thing under test.
 * Category   Column H verbatim, trimmed. Blank is allowed (FinAhead permits an
 *            empty category); non-string values are blanked and counted.
 * Currency   The dataset is GBP (UK bank, UK locations). FinAhead is
 *            single-currency and performs no conversion, so amounts are carried
 *            across unchanged and read as major units. No FX is applied; the
 *            arithmetic is currency-agnostic.
 * Balance    Carried in a sidecar file, not in the FinAhead CSV, because
 *            FinAhead's schema has no balance column. Used only to reconcile.
 * Ordering   Source rows are newest-first. The adapter emits the reverse of the
 *            source row order — i.e. the bank statement's own sequence read
 *            forwards — NOT a date sort.
 *
 *            This matters and was measured. The published rows are not strictly
 *            date-ordered: there are 149 chronological inversions. Reconciling
 *            the balance chain in statement order gives 98.88%; re-sorting by
 *            date first drops it to 88.43%. The statement order is therefore
 *            the authoritative sequence, and re-sorting by date would corrupt
 *            it. FinAhead itself does not care — its detectors sort by date
 *            internally — but the reconciliation check does.
 */

import { readSheet, serialToIso } from '../lib/xlsx.mjs'

export const SOURCE = {
  title: 'Bank Transactions Dataset (MoneyData)',
  author: 'Laramee, Robert',
  institution: 'University of Nottingham',
  version: '1',
  published: '2026-01-14',
  doi: '10.17632/dnxtg6n4rv.1',
  url: 'https://data.mendeley.com/datasets/dnxtg6n4rv/1',
  paper: 'https://doi.org/10.2312/evs.20231052',
  licence: 'CC BY 4.0',
  file: 'laramee26openBankTransactionData.xlsx',
  sha256: '716eaf9ad4a3cf60dc9c9c8a20ed9a917c545a1b5f139f40ed91d2104faa3ff7',
  bytes: 507389,
  citation:
    'Laramee, Robert (2026), "Bank Transactions Dataset", Mendeley Data, V1, doi: 10.17632/dnxtg6n4rv.1 (CC BY 4.0)',
}

const COL = {
  number: 0,
  date: 1,
  type: 2,
  description: 3,
  amount: 4,
  balanceIfDebit: 5,
  balanceIfCredit: 6,
  category: 7,
}

function toIsoDate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return serialToIso(value)
  }
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (!match) return null
    const [, day, month, year] = match
    const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    // Reject impossible calendar dates rather than letting Date roll them over.
    const probe = new Date(`${iso}T00:00:00.000Z`)
    if (Number.isNaN(probe.getTime()) || probe.toISOString().slice(0, 10) !== iso) {
      return null
    }
    return iso
  }
  return null
}

/** Round to integer pence/cents; the benchmark compares money as integers. */
function toMinorUnits(value) {
  return Math.sign(value) * Math.round(Math.abs(value) * 100)
}

/**
 * Read the workbook and produce FinAhead-shaped rows plus a rejection log.
 * Nothing is dropped silently: every source row ends up in exactly one bucket.
 */
export function adaptMoneyData(xlsxPath) {
  const sheet = readSheet(xlsxPath)
  const header = sheet[0]
  const rows = sheet.slice(1)

  const accepted = []
  const rejected = []
  let blankRows = 0
  let blankedCategories = 0

  rows.forEach((row, index) => {
    const sourceRow = index + 2 // 1-based, counting the header

    if (!row || row.filter((cell) => cell !== undefined && cell !== null).length === 0) {
      blankRows += 1
      return
    }

    const reject = (reason, detail) =>
      rejected.push({ sourceRow, reason, detail, raw: JSON.stringify(row) })

    const date = toIsoDate(row[COL.date])
    if (date === null) {
      reject('invalid-date', String(row[COL.date]))
      return
    }

    const magnitude = row[COL.amount]
    if (typeof magnitude !== 'number' || !Number.isFinite(magnitude)) {
      reject('nonnumeric-amount', String(row[COL.amount]))
      return
    }

    const debitBalance = row[COL.balanceIfDebit]
    const creditBalance = row[COL.balanceIfCredit]
    const hasDebit = typeof debitBalance === 'number'
    const hasCredit = typeof creditBalance === 'number'

    if (hasDebit === hasCredit) {
      // Both or neither populated: direction is genuinely undetermined.
      reject('ambiguous-direction', `F=${debitBalance} G=${creditBalance}`)
      return
    }

    const description = row[COL.description]
    if (typeof description !== 'string' || description.trim() === '') {
      reject('missing-description', String(description))
      return
    }

    const rawCategory = row[COL.category]
    let category = ''
    if (typeof rawCategory === 'string') category = rawCategory.trim()
    else if (rawCategory !== undefined && rawCategory !== null) blankedCategories += 1

    accepted.push({
      sourceRow,
      transactionNumber: row[COL.number],
      date,
      type: typeof row[COL.type] === 'string' ? row[COL.type] : String(row[COL.type] ?? ''),
      merchant: description.trim(),
      // Direction comes from which balance column is populated.
      amountMinor: hasDebit ? -toMinorUnits(magnitude) : toMinorUnits(magnitude),
      balanceMinor: toMinorUnits(hasDebit ? debitBalance : creditBalance),
      category,
    })
  })

  // Statement order read forwards: the source is newest-first, so reversing the
  // row order recovers the sequence the balances were actually written in.
  const statementOrder = [...accepted].sort((a, b) => b.sourceRow - a.sourceRow)

  // Reported for transparency: how far the published order departs from a
  // strict date sort.
  let dateInversions = 0
  for (let i = 1; i < statementOrder.length; i += 1) {
    if (statementOrder[i].date < statementOrder[i - 1].date) dateInversions += 1
  }

  return {
    header,
    totalSourceRows: rows.length,
    blankRows,
    blankedCategories,
    accepted: statementOrder,
    dateInversions,
    rejected,
  }
}

/** Serialise accepted rows into the CSV schema FinAhead's parser accepts. */
export function toFinAheadCsv(accepted) {
  const escape = (value) =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  const lines = ['date,merchant,amount,category']
  for (const row of accepted) {
    lines.push(
      [
        row.date,
        escape(row.merchant),
        (row.amountMinor / 100).toFixed(2),
        escape(row.category),
      ].join(','),
    )
  }
  return `${lines.join('\n')}\n`
}
