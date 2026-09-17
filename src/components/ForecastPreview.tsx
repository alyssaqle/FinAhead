import { useMemo } from 'react'
import { buildDemoForecast } from '../data/demoForecast'
import { buildRunwaySeries } from '../domain/buildRunwaySeries'
import { applyScenario } from '../domain/applyScenario'
import { formatCurrency } from '../domain/money'
import { addDays, formatShortDate } from '../domain/dateUtils'
import { CashRunwayChart } from './CashRunwayChart'

interface ForecastPreviewProps {
  asOfDate: string
  /** Include the what-if strip. Off for the compact card in the app. */
  showScenario?: boolean
}

/** How many obligations to name before summarising the rest. */
const LISTED_OBLIGATIONS = 3

/** The $350 trip is the scenario the product is demonstrated with. */
const PREVIEW_SCENARIO_AMOUNT = 350

/**
 * A preview of the product, shown on the public page and on the sample-account
 * card.
 *
 * Every figure is computed by the real pipeline for the real demo account —
 * the same detectors, the same forecast engine, the same scenario engine, the
 * same chart component. There is no separate preview dataset to fall out of
 * step with the product, and the numbers here are necessarily the numbers the
 * button opens.
 */
export function ForecastPreview({
  asOfDate,
  showScenario = true,
}: ForecastPreviewProps) {
  const { forecast, input } = useMemo(
    () => buildDemoForecast(asOfDate),
    [asOfDate],
  )
  const series = useMemo(() => buildRunwaySeries(forecast), [forecast])

  const obligations = forecast.events.filter((event) => event.kind === 'expense')
  const listed = obligations.slice(0, LISTED_OBLIGATIONS)
  const remaining = obligations.length - listed.length

  const scenario = useMemo(
    () =>
      showScenario
        ? applyScenario(input, {
            amount: PREVIEW_SCENARIO_AMOUNT,
            date: addDays(asOfDate, 1),
            label: 'Weekend trip',
          })
        : null,
    [showScenario, input, asOfDate],
  )

  return (
    <div className="preview">
      <CashRunwayChart
        series={series}
        variant="compact"
        title="Sample cash runway from today to the next payday"
      />

      <dl className="preview__meta">
        <div>
          <dt className="label-caps">Balance today</dt>
          <dd className="tabular">{formatCurrency(forecast.startingBalance)}</dd>
        </div>
        <div>
          <dt className="label-caps">Next income</dt>
          <dd className="tabular preview__in">
            {forecast.nextIncome
              ? `+${formatCurrency(forecast.nextIncome.amount)}`
              : '—'}
          </dd>
        </div>
      </dl>

      <ul className="preview__rows">
        {listed.map((event) => (
          <li key={event.id}>
            <span className="preview__row-name">{event.label}</span>
            <span className="text-sm text-secondary">
              {formatShortDate(event.date)}
            </span>
            <span className="tabular">{formatCurrency(event.amount)}</span>
          </li>
        ))}
        {remaining > 0 ? (
          <li className="preview__more">
            + {remaining} more upcoming payment{remaining === 1 ? '' : 's'}
          </li>
        ) : null}
      </ul>

      {scenario?.comparison ? (
        <div className="preview__scenario">
          <span className="text-sm">
            With a {formatCurrency(PREVIEW_SCENARIO_AMOUNT)} trip
          </span>
          <span className="preview__compare">
            <span className="tabular preview__was">
              {formatCurrency(scenario.comparison.baseline.lowestBalance)}
            </span>
            <span className="preview__arrow" aria-hidden="true">
              →
            </span>
            <span className="tabular preview__now">
              {formatCurrency(scenario.comparison.projected.lowestBalance)}
            </span>
          </span>
        </div>
      ) : null}
    </div>
  )
}
