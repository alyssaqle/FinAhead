import { useState } from 'react'
import { isValidIsoDate } from '../domain/dateUtils'
import { parseMoney } from '../domain/money'

interface ManualIncomeFormProps {
  asOfDate: string
  current: { date: string; amount: number } | null
  onSubmit: (date: string, amount: number) => void
  onClear: () => void
}

/**
 * The no-income fallback.
 *
 * When detection cannot find a repeating deposit, FinAhead says so and asks
 * rather than inventing a payday. Without a next income date there is no
 * "before payday" to measure against, and a made-up one would quietly corrupt
 * the only number on the screen that matters.
 */
export function ManualIncomeForm({
  asOfDate,
  current,
  onSubmit,
  onClear,
}: ManualIncomeFormProps) {
  const [date, setDate] = useState(current?.date ?? '')
  const [amount, setAmount] = useState(current ? String(current.amount) : '')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const value = parseMoney(amount)
    if (!isValidIsoDate(date)) {
      setError('Choose the date you next expect to be paid.')
      return
    }
    if (date <= asOfDate) {
      setError('Choose a date in the future.')
      return
    }
    if (value === null || value <= 0) {
      setError('Enter the deposit amount as a number greater than zero.')
      return
    }
    setError(null)
    onSubmit(date, value)
  }

  return (
    <section className="card stack stack-4">
      <div>
        <h2 className="screen__section-title">Tell FinAhead when you expect to be paid</h2>
        <p className="text-secondary">
          FinAhead could not identify a repeating income deposit in this history, so
          it will not guess one. Enter your next expected deposit and the forecast
          will measure your low point against it.
        </p>
      </div>

      <div className="manual-income__fields">
        <div className="field">
          <label className="field-label" htmlFor="manual-income-date">
            Next expected income date
          </label>
          <input
            id="manual-income-date"
            className="input"
            type="date"
            min={asOfDate}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="manual-income-amount">
            Expected amount
          </label>
          <input
            id="manual-income-amount"
            className="input"
            type="text"
            inputMode="decimal"
            placeholder="1200.00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit()
            }}
          />
        </div>
      </div>

      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="row">
        <button type="button" className="btn btn-primary" onClick={submit}>
          {current ? 'Update expected income' : 'Add expected income'}
        </button>
        {current ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setDate('')
              setAmount('')
              onClear()
            }}
          >
            Remove
          </button>
        ) : null}
      </div>
    </section>
  )
}
