import { useState } from 'react'
import type { PredictedEvent, PredictionEdit } from '../domain/types'
import { formatCurrency, parseMoney } from '../domain/money'
import {
  formatDateList,
  formatDisplayDate,
  formatMonthDay,
} from '../domain/dateUtils'
import { IconChevron } from './icons'

interface PredictionCardProps {
  prediction: PredictedEvent
  onEdit: (id: string, edit: PredictionEdit) => void
  onResetEdit: (id: string) => void
  onReject: (id: string) => void
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high: 'Strong evidence',
  medium: 'Some evidence',
  low: 'Limited evidence',
}

const CONFIDENCE_TONE: Record<string, string> = {
  high: 'badge-green',
  medium: '',
  low: 'badge-amber',
}

/**
 * One predicted event, with the history behind it and the controls to correct
 * or remove it.
 *
 * The supporting transactions sit behind a native `<details>` disclosure, which
 * keeps the list scannable while leaving expand/collapse to the browser. The
 * wording ("approximately", "expected") never states a prediction as a fact.
 */
export function PredictionCard({
  prediction,
  onEdit,
  onResetEdit,
  onReject,
}: PredictionCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [amountDraft, setAmountDraft] = useState(
    Math.abs(prediction.amount).toFixed(2),
  )
  const [dateDraft, setDateDraft] = useState(prediction.date)
  const [error, setError] = useState<string | null>(null)

  const evidence = prediction.evidence
  const isEdited = prediction.source === 'user-edited'
  const isIncome = prediction.kind === 'income'

  function startEditing() {
    setAmountDraft(Math.abs(prediction.amount).toFixed(2))
    setDateDraft(prediction.date)
    setError(null)
    setIsEditing(true)
  }

  function save() {
    const amount = parseMoney(amountDraft)
    if (amount === null || amount <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    if (!dateDraft) {
      setError('Choose the date you expect this on.')
      return
    }
    onEdit(prediction.id, { amount, date: dateDraft })
    setIsEditing(false)
    setError(null)
  }

  return (
    <li className="pred" data-edited={isEdited}>
      <div className="pred__head">
        <div className="pred__id">
          <p className="pred__name">{prediction.displayName}</p>
          <p className="text-sm text-secondary">
            Expected {formatMonthDay(prediction.date)}
          </p>
        </div>
        <p className="pred__amount tabular">
          <span className="text-sm text-secondary">approximately </span>
          {formatCurrency(Math.abs(prediction.amount))}
        </p>
      </div>

      <div className="pred__tags">
        <span className={`badge ${isIncome ? 'badge-green' : ''}`}>
          {isIncome ? 'Income' : 'Expense'}
        </span>
        <span className="badge badge-blue">Predicted</span>
        {evidence ? (
          <span className={`badge ${CONFIDENCE_TONE[evidence.confidence]}`}>
            {CONFIDENCE_LABEL[evidence.confidence]}
          </span>
        ) : null}
        {isEdited ? <span className="badge badge-amber">Edited by you</span> : null}
      </div>

      {evidence ? (
        <>
          <p className="text-sm text-secondary">
            Based on payments from{' '}
            {formatDateList(evidence.transactions.map((row) => row.date))}.
          </p>

          <details className="evidence">
            <summary className="evidence__summary">
              <IconChevron size={16} className="evidence__chevron" />
              View evidence
              <span className="text-sm text-secondary">
                ({evidence.transactions.length} transactions)
              </span>
            </summary>
            <div className="evidence__body">
              <ul className="evidence__list">
                {evidence.transactions.map((row) => (
                  <li key={row.id}>
                    <span className="evidence__when">
                      {formatDisplayDate(row.date)}
                    </span>
                    <span className="evidence__merchant">{row.merchant}</span>
                    <span className="tabular">{formatCurrency(row.amount)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-secondary">
                {evidence.confidenceReason} Charges arrived about every{' '}
                {Math.round(evidence.medianIntervalDays)} days, and the amount
                varied by {Math.round(evidence.amountVariationPct * 100)}%.
                FinAhead used the median amount as the estimate.
              </p>
            </div>
          </details>
        </>
      ) : (
        <p className="text-sm text-secondary">
          You entered this yourself, so there is no transaction history behind it.
        </p>
      )}

      {isEditing ? (
        <div className="pred__edit">
          <div className="pred__edit-fields">
            <div className="field">
              <label className="field-label" htmlFor={`${prediction.id}-amount`}>
                Amount
              </label>
              <div className="input-money">
                <span className="input-money__prefix" aria-hidden="true">
                  $
                </span>
                <input
                  id={`${prediction.id}-amount`}
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountDraft}
                  onChange={(event) => setAmountDraft(event.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label className="field-label" htmlFor={`${prediction.id}-date`}>
                Expected date
              </label>
              <input
                id={`${prediction.id}-date`}
                className="input"
                type="date"
                value={dateDraft}
                onChange={(event) => setDateDraft(event.target.value)}
              />
            </div>
          </div>
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="pred__actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={save}>
              Save change
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="pred__actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={startEditing}
          >
            Edit
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onReject(prediction.id)}
          >
            Not recurring
          </button>
          {isEdited ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onResetEdit(prediction.id)}
            >
              Undo my change
            </button>
          ) : null}
        </div>
      )}
    </li>
  )
}
