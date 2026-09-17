import type {
  ForecastResult,
  PredictedEvent,
  PredictionEdit,
} from '../domain/types'
import { formatCurrency } from '../domain/money'
import { diffDays, formatDisplayDate } from '../domain/dateUtils'
import { Callout } from '../components/Callout'
import { Timeline } from '../components/Timeline'
import { PredictionCard } from '../components/PredictionCard'
import { ManualIncomeForm } from '../components/ManualIncomeForm'
import { CashRunwayChart } from '../components/CashRunwayChart'
import { buildRunwaySeries } from '../domain/buildRunwaySeries'
import { IconArrowRight } from '../components/icons'

interface ForecastScreenProps {
  forecast: ForecastResult
  predictions: PredictedEvent[]
  excluded: PredictedEvent[]
  transactionCount: number
  sourceLabel: string
  manualIncome: { date: string; amount: number } | null
  needsManualIncome: boolean
  onEdit: (id: string, edit: PredictionEdit) => void
  onResetEdit: (id: string) => void
  onReject: (id: string) => void
  onRestore: (id: string) => void
  onSetManualIncome: (date: string, amount: number) => void
  onClearManualIncome: () => void
  onStartScenario: () => void
}

/**
 * Step 2 — the cash forecast.
 *
 * The projected low before payday is the one number this screen exists to
 * deliver, so it is the largest thing on it. Supporting figures sit beneath it,
 * the arithmetic that produced it follows in the timeline, and the evidence
 * behind each prediction comes last. Every figure comes from the forecast
 * engine; none of it is written into this component.
 */
export function ForecastScreen({
  forecast,
  predictions,
  excluded,
  transactionCount,
  sourceLabel,
  manualIncome,
  needsManualIncome,
  onEdit,
  onResetEdit,
  onReject,
  onRestore,
  onSetManualIncome,
  onClearManualIncome,
  onStartScenario,
}: ForecastScreenProps) {
  const income = forecast.nextIncome
  const incomePrediction = predictions.find(
    (prediction) => prediction.id === income?.predictedEventId,
  )

  const isNegative = forecast.lowestBalance < 0
  const daysToIncome = income ? diffDays(forecast.asOfDate, income.date) : null
  const series = buildRunwaySeries(forecast)

  const obligationsTotal = forecast.events
    .filter((event) => event.kind === 'expense')
    .reduce((total, event) => total + Math.abs(event.amount), 0)

  /**
   * Split predictions at the forecast horizon. A bill after payday is still
   * worth showing, but it is not in the timeline or the low point above, and
   * listing the two together makes the timeline look like it is missing rows.
   */
  const byDate = [...predictions].sort((a, b) => (a.date < b.date ? -1 : 1))
  const inWindow = byDate.filter((p) => p.date <= forecast.horizonDate)
  const afterWindow = byDate.filter((p) => p.date > forecast.horizonDate)

  return (
    <div className="screen">
      <header className="screen__head">
        <h1 className="screen__title">Your cash forecast</h1>
        <p className="screen__lede">
          {transactionCount} transactions from {sourceLabel}, as of{' '}
          {formatDisplayDate(forecast.asOfDate)}.{' '}
          {income
            ? `This forecast runs to your next expected income deposit on ${formatDisplayDate(
                forecast.horizonDate,
              )}.`
            : `This forecast runs to ${formatDisplayDate(forecast.horizonDate)}.`}
        </p>
      </header>

      {forecast.warnings.map((warning) => (
        <Callout
          key={warning.code}
          tone={warning.code === 'negative-balance' ? 'warning' : 'info'}
        >
          {warning.message}
        </Callout>
      ))}

      {/* Hero — the runway is the product's one visual idea ------------- */}
      <section className="fc-hero" data-negative={isNegative}>
        <CashRunwayChart
          series={series}
          variant="hero"
          title="Your cash runway from today to your next expected income"
        />

        <div className="fc-hero__foot">
          <p className="fc-hero__explain">
            {isNegative
              ? 'Your balance is projected to fall below zero before your next expected deposit. Check the predictions below — an incorrect amount or date will change this.'
              : `This is the lowest point your balance is projected to reach after ${
                  forecast.events.filter((event) => event.kind === 'expense').length
                } upcoming obligations${
                  daysToIncome !== null
                    ? `, ${daysToIncome} ${daysToIncome === 1 ? 'day' : 'days'} before your next expected income`
                    : ''
                }.`}
          </p>

          <button type="button" className="btn btn-primary" onClick={onStartScenario}>
            Try a what-if purchase
            <IconArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* Supporting metrics -------------------------------------------- */}
      <dl className="fc-metrics">
        <div className="fc-metric">
          <dt className="label-caps">Current balance</dt>
          <dd className="tabular">{formatCurrency(forecast.startingBalance)}</dd>
          <p className="text-sm text-secondary">
            As of {formatDisplayDate(forecast.asOfDate)}
          </p>
        </div>
        <div className="fc-metric">
          <dt className="label-caps">Next expected income</dt>
          <dd className="tabular fc-metric__in">
            {income ? formatCurrency(income.amount) : 'Not identified'}
          </dd>
          <p className="text-sm text-secondary">
            {income
              ? `Estimated for ${formatDisplayDate(income.date)}${
                  incomePrediction?.evidence
                    ? ` · based on ${incomePrediction.evidence.transactions.length} previous deposits`
                    : ' · entered by you'
                }`
              : 'FinAhead could not find a repeating deposit'}
          </p>
        </div>
        <div className="fc-metric">
          <dt className="label-caps">Upcoming obligations</dt>
          <dd className="tabular">{formatCurrency(obligationsTotal)}</dd>
          <p className="text-sm text-secondary">
            {forecast.events.filter((event) => event.kind === 'expense').length}{' '}
            payments before your next deposit
          </p>
        </div>
      </dl>

      {/* Timeline ------------------------------------------------------- */}
      <section className="screen__section">
        <h2 className="screen__section-title">Cash-flow timeline</h2>
        <Timeline forecast={forecast} />
        <p className="text-sm text-secondary">
          When several events fall on the same day, FinAhead applies money leaving
          the account before money arriving, so the timeline shows the lowest point
          that day actually reaches.
        </p>
      </section>

      {needsManualIncome ? (
        <ManualIncomeForm
          asOfDate={forecast.asOfDate}
          current={manualIncome}
          onSubmit={onSetManualIncome}
          onClear={onClearManualIncome}
        />
      ) : null}

      {/* Predictions ---------------------------------------------------- */}
      <section className="screen__section">
        <h2 className="screen__section-title">What FinAhead predicted, and why</h2>
        {predictions.length === 0 ? (
          <Callout tone="note">
            No repeating payments were found in this history. You can still run a
            what-if purchase against your current balance.
          </Callout>
        ) : (
          <ul className="pred-list">
            {inWindow.map((prediction) => (
              <PredictionCard
                key={prediction.id}
                prediction={prediction}
                onEdit={onEdit}
                onResetEdit={onResetEdit}
                onReject={onReject}
              />
            ))}
          </ul>
        )}
      </section>

      {afterWindow.length > 0 ? (
        <section className="screen__section">
          <h2 className="screen__section-title">Found, but after this forecast window</h2>
          <p className="text-sm text-secondary">
            These repeat too, but they fall after{' '}
            {formatDisplayDate(forecast.horizonDate)}, so they are not part of the
            timeline or the projected low above.
          </p>
          <ul className="pred-list">
            {afterWindow.map((prediction) => (
              <PredictionCard
                key={prediction.id}
                prediction={prediction}
                onEdit={onEdit}
                onResetEdit={onResetEdit}
                onReject={onReject}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {excluded.length > 0 ? (
        <section className="screen__section">
          <h2 className="screen__section-title">Excluded by you</h2>
          <ul className="pred-list">
            {excluded.map((prediction) => (
              <li key={prediction.id} className="pred pred--excluded">
                <div className="pred__head">
                  <div className="pred__id">
                    <p className="pred__name">{prediction.displayName}</p>
                    <p className="text-sm text-secondary">
                      Marked not recurring — left out of the forecast.
                    </p>
                  </div>
                  <p className="pred__amount tabular">
                    {formatCurrency(Math.abs(prediction.amount))}
                  </p>
                </div>
                <div className="pred__actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onRestore(prediction.id)}
                  >
                    Put it back
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="screen__section">
        <h2 className="screen__section-title">What this forecast does not include</h2>
        <ul className="bullet-list">
          {forecast.missingAssumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
