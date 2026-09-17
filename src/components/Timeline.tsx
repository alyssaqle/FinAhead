import type { ForecastResult } from '../domain/types'
import { formatCurrency, formatSignedCurrency } from '../domain/money'
import { formatShortDate } from '../domain/dateUtils'

interface TimelineProps {
  forecast: ForecastResult
  /** Emphasise the what-if row. */
  highlightScenario?: boolean
}

/**
 * The cash-flow timeline: every expected event between today and the next
 * income deposit, with the running balance after each one.
 *
 * It opens on today's balance so the user can trace the arithmetic from a
 * number they already know down to the projected low point. Meaning never rests
 * on colour: income carries a `+` and the word "Income", the low point and the
 * payday are labelled in text, and a negative balance is marked as well as
 * tinted.
 */
export function Timeline({ forecast, highlightScenario = false }: TimelineProps) {
  const lowPointIsToday = forecast.lowPointEventId === null

  return (
    <ol className="timeline">
      <li className="tl-row tl-row--start" data-low={lowPointIsToday}>
        <span className="tl-date">{formatShortDate(forecast.asOfDate)}</span>
        <span className="tl-marker" aria-hidden="true" />
        <span className="tl-main">
          <span className="tl-name">Balance today</span>
          {lowPointIsToday ? (
            <span className="tl-note">
              Projected low before payday — nothing is scheduled to leave before
              then
            </span>
          ) : null}
        </span>
        <span className="tl-amount tl-amount--none">—</span>
        <span className="tl-balance tabular">
          {formatCurrency(forecast.startingBalance)}
        </span>
      </li>

      {forecast.events.map((event) => {
        const isLowPoint = event.id === forecast.lowPointEventId
        const isScenario = event.source === 'scenario'
        const isNegative = event.balanceAfter < 0
        const isIncome = event.kind === 'income'

        return (
          <li
            key={event.id}
            className="tl-row"
            data-low={isLowPoint}
            data-negative={isNegative}
            data-scenario={isScenario && highlightScenario}
            data-payday={event.isPrimaryIncome}
          >
            <span className="tl-date">{formatShortDate(event.date)}</span>
            <span className="tl-marker" aria-hidden="true" />
            <span className="tl-main">
              <span className="tl-name">{event.label}</span>
              <span className="tl-tags">
                <span className={`badge ${isIncome ? 'badge-green' : ''}`}>
                  {isIncome ? 'Income' : 'Expense'}
                </span>
                {event.isPrediction ? (
                  <span className="badge badge-blue">Predicted</span>
                ) : null}
                {isScenario ? (
                  <span className="badge badge-amber">What-if</span>
                ) : null}
              </span>
              {isLowPoint ? (
                <span className="tl-note">Projected low before payday</span>
              ) : null}
              {event.isPrimaryIncome ? (
                <span className="tl-note">
                  Next expected income — the forecast ends here
                </span>
              ) : null}
            </span>
            <span className={`tl-amount ${isIncome ? 'tl-amount--in' : ''}`}>
              {formatSignedCurrency(event.amount)}
            </span>
            <span className="tl-balance tabular" data-negative={isNegative}>
              {formatCurrency(event.balanceAfter)}
              {isNegative ? (
                <span className="visually-hidden"> (below zero)</span>
              ) : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
