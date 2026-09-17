/** Serialise transactions back to the CSV shape FinAhead accepts. */

import type { Transaction } from '../domain/types'

function escapeField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function toCsv(transactions: Transaction[]): string {
  const lines = ['date,merchant,amount,category']
  for (const transaction of transactions) {
    lines.push(
      [
        transaction.date,
        escapeField(transaction.merchant),
        transaction.amount.toFixed(2),
        escapeField(transaction.category),
      ].join(','),
    )
  }
  return `${lines.join('\n')}\n`
}

/**
 * Hand the user a file without a server: the CSV is built in memory and
 * released through a temporary object URL. Nothing is uploaded.
 */
export function downloadCsv(filename: string, contents: string): void {
  const url = URL.createObjectURL(
    new Blob([contents], { type: 'text/csv;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
