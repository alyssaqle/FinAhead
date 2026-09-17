import { useMemo, useState } from 'react'
import type { Scenario } from '../domain/types'
import { applyScenario } from '../domain/applyScenario'
import { buildForecast, type ForecastInput } from '../domain/buildForecast'
import { formatCurrency, parseMoney } from '../domain/money'
import { formatDisplayDate, formatShortDate } from '../domain/dateUtils'
import { Callout } from '../components/Callout'
import { Timeline } from '../components/Timeline'
import { CashRunwayChart } from '../components/CashRunwayChart'
import { buildRunwaySeries, combineScale } from '../domain/buildRunwaySeries'
import { IconAlert, IconArrowRight } from '../components/icons'

interface ScenarioScreenProps {
  forecastInput: ForecastInput
  /** Lifted to the app so the scenario survives moving between steps. */
  scenario: Scenario | null
  onScenarioChange: (scenario: Scenario | null) => void
  onBack: () => void
}

/**
 * Step 3 — the what-if.
 *
 * The user enters a purchase as a positive number; the engine turns it into an
 * outflow, drops it into the timeline and recalculates. The screen reports what
 * changed and where, and stops there. It does not say whether to buy the thing,
 * because that judgement depends on everything this data does not contain.
 */
export function ScenarioScreen({
  forecastInput,
  scenario,
  onScenarioChange,
  onBack,
}: ScenarioScreenProps) {
  const baseline = useMemo(
    () => buildForecast({ ...forecastInput, scenario: null }),
    [forecastInput],
  )

  const [amount, setAmount] = useState(
    scenario ? String(Math.abs(scenario.amount)) : '',
  )
  const [date, setDate] = useState(scenario?.date ?? forecastInput.asOfDate)
  const [label, setLabel] = useState(scenario?.label ?? '')
  const [isEditing, setIsEditing] = useState(scenario === null)

  const outcome = useMemo(
    () => (scenario ? applyScenario(forecastInput, scenario) : null),
    [forecastInput, scenario],
  )

  const errors = outcome?.errors ?? []
  const comparison = outcome?.comparison ?? null
  const amountError = errors.find((error) => error.field === 'amount')
  const dateError = errors.find((error) => error.field === 'date')

  const remainingObligations = baseline.events.filter(
    (event) => event.kind === 'expense',
  )

  // Both runs are drawn on one shared vertical scale, so the drop between them
  // is read by eye rather than by re-reading the axis.
  const baselineSeries = useMemo(
    () => buildRunwaySeries(comparison?.baseline ?? baseline),
    [comparison, baseline],
  )
  const projectedSeries = useMemo(
    () => (comparison ? buildRunwaySeries(comparison.projected) : null),
    [comparison],
  )
  const sharedScale = useMemo(
    () =>
      projectedSeries
        ? combineScale(baselineSeries, projectedSeries)
        : combineScale(baselineSeries),
    [baselineSeries, projectedSeries],
  )

  function submit() {
    onScenarioChange({
      // An empty or unparseable box is not zero, so it is sent through as NaN
      // and reported by the validator rather than silently becoming 0.
      amount: parseMoney(amount) ?? Number.NaN,
      date,
      label,
    })
    setIsEditing(false)
  }

  function removeScenario() {
    onScenarioChange(null)
    setAmount('')
    setLabel('')
    setDate(forecastInput.asOfDate)
    setIsEditing(true)
  }

  const showForm = isEditing || comparison === null

  return (
    <div className="screen">
      <header className="screen__head">
        <h1 className="screen__title">What if I make this purchase?</h1>
        <p className="screen__lede">
          Enter what you are considering. FinAhead will show how your projected low
          before{' '}
          {baseline.nextIncome
            ? `your next income deposit on ${formatDisplayDate(baseline.horizonDate)}`
            : formatDisplayDate(baseline.horizonDate)}{' '}
          would change. It will not tell you whether to buy it.
        </p>
      </header>

      <div className="scenario-grid">
        {/* Left: the form --------------------------------------------- */}
        <section className="card scenario-form" aria-labelledby="scenario-form-title">
          <h2 id="scenario-form-title" className="screen__section-title">
            {showForm ? 'Your purchase' : 'Scenario'}
          </h2>

          {showForm ? (
            <>
              <div className="field">
                <label className="field-label" htmlFor="scenario-amount">
                  Purchase or transfer amount
                </label>
                <div
                  className="input-money"
                  data-invalid={amountError ? 'true' : 'false'}
                >
                  <span className="input-money__prefix" aria-hidden="true">
                    $
                  </span>
                  <input
                    id="scenario-amount"
                    className="input"
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    aria-invalid={amountError ? 'true' : undefined}
                    aria-describedby={
                      amountError ? 'scenario-amount-error' : 'scenario-amount-hint'
                    }
                    onChange={(event) => setAmount(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') submit()
                    }}
                  />
                </div>
                {amountError ? (
                  <span className="field-error" id="scenario-amount-error" role="alert">
                    {amountError.message}
                  </span>
                ) : (
                  <span className="field-hint" id="scenario-amount-hint">
                    Enter it as a positive number.
                  </span>
                )}
              </div>

              <div className="field">
                <label className="field-label" htmlFor="scenario-date">
                  Date of the purchase
                </label>
                <input
                  id="scenario-date"
                  className="input"
                  type="date"
                  min={baseline.asOfDate}
                  max={baseline.horizonDate}
                  value={date}
                  aria-invalid={dateError ? 'true' : undefined}
                  aria-describedby={
                    dateError ? 'scenario-date-error' : 'scenario-date-hint'
                  }
                  onChange={(event) => setDate(event.target.value)}
                />
                {dateError ? (
                  <span className="field-error" id="scenario-date-error" role="alert">
                    {dateError.message}
                  </span>
                ) : (
                  <span className="field-hint" id="scenario-date-hint">
                    Between {formatDisplayDate(baseline.asOfDate)} and{' '}
                    {formatDisplayDate(baseline.horizonDate)}.
                  </span>
                )}
              </div>

              <div className="field">
                <label className="field-label" htmlFor="scenario-label">
                  Label <span className="text-secondary">(optional)</span>
                </label>
                <input
                  id="scenario-label"
                  className="input"
                  type="text"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') submit()
                  }}
                />
                <span className="field-hint">
                  For example, &ldquo;Weekend trip&rdquo;.
                </span>
              </div>

              <div className="scenario-form__actions">
                <button type="button" className="btn btn-primary" onClick={submit}>
                  See the effect
                </button>
                <button type="button" className="btn btn-secondary" onClick={onBack}>
                  Back to forecast
                </button>
              </div>
            </>
          ) : (
            <>
              <dl className="scenario-summary">
                <div>
                  <dt className="label-caps">Purchase</dt>
                  <dd>{scenario?.label?.trim() || 'Hypothetical purchase'}</dd>
                </div>
                <div>
                  <dt className="label-caps">Amount</dt>
                  <dd className="tabular">
                    {formatCurrency(Math.abs(scenario?.amount ?? 0))}
                  </dd>
                </div>
                <div>
                  <dt className="label-caps">Date</dt>
                  <dd>{formatDisplayDate(scenario?.date ?? '')}</dd>
                </div>
              </dl>

              <div className="scenario-form__actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsEditing(true)}
                >
                  Edit scenario
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={removeScenario}
                >
                  Remove scenario
                </button>
                <button type="button" className="btn btn-ghost" onClick={onBack}>
                  Back to forecast
                </button>
              </div>
            </>
          )}
        </section>

        {/* Right: preview before, comparison after --------------------- */}
        <section className="scenario-panel" aria-live="polite">
          {comparison ? (
            <div className="compare" data-negative={comparison.goesBelowZero}>
              <p className="compare__title">
                {scenario?.label?.trim() || 'This purchase'} ·{' '}
                {formatCurrency(Math.abs(scenario?.amount ?? 0))} on{' '}
                {formatShortDate(scenario?.date ?? '')}
              </p>

              <div className="compare__pair">
                <div className="compare__side">
                  <span className="label-caps">Before</span>
                  <span className="compare__amount compare__amount--was tabular">
                    {formatCurrency(comparison.baseline.lowestBalance)}
                  </span>
                  <span className="text-sm text-secondary">
                    {formatDisplayDate(comparison.baseline.lowestBalanceDate)}
                  </span>
                </div>
                <span className="compare__arrow" aria-hidden="true">
                  <IconArrowRight size={20} />
                </span>
                <div className="compare__side">
                  <span className="label-caps">After this purchase</span>
                  <span className="compare__amount tabular">
                    {formatCurrency(comparison.projected.lowestBalance)}
                  </span>
                  <span className="text-sm text-secondary">
                    {formatDisplayDate(comparison.projected.lowestBalanceDate)}
                  </span>
                </div>
              </div>

              <div className="compare__delta">
                <span className="label-caps">Difference</span>
                <span className="tabular compare__delta-amount">
                  {formatCurrency(comparison.difference)}
                </span>
              </div>

              <p className="compare__sentence">
                This purchase would lower your projected pre-payday balance from{' '}
                <strong>{formatCurrency(comparison.baseline.lowestBalance)}</strong>{' '}
                to <strong>{formatCurrency(comparison.projected.lowestBalance)}</strong>
                .
              </p>

              {comparison.goesBelowZero ? (
                <div className="compare__warning">
                  <IconAlert size={18} />
                  <p>
                    This scenario would bring the projected balance below $0 before
                    the next expected income deposit. Overdraft or returned-payment
                    fees are not included in this estimate.
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="scenario-preview">
              <CashRunwayChart
                series={baselineSeries}
                scale={sharedScale}
                variant="compact"
                title="Your current cash runway, before any hypothetical purchase"
              />

              <p className="scenario-preview__prompt">Enter a purchase to compare.</p>

              <div className="scenario-preview__list">
                <p className="label-caps">Still to come before payday</p>
                <ul>
                  {remainingObligations.slice(0, 5).map((event) => (
                    <li key={event.id}>
                      <span className="scenario-preview__name">{event.label}</span>
                      <span className="text-sm text-secondary">
                        {formatShortDate(event.date)}
                      </span>
                      <span className="tabular">
                        {formatCurrency(event.amount)}
                      </span>
                    </li>
                  ))}
                  {remainingObligations.length === 0 ? (
                    <li className="text-secondary">
                      No predicted obligations before your next deposit.
                    </li>
                  ) : null}
                </ul>
                {baseline.nextIncome ? (
                  <p className="scenario-preview__payday">
                    Payday {formatShortDate(baseline.nextIncome.date)} ·{' '}
                    <span className="tabular">
                      {formatCurrency(baseline.nextIncome.amount)}
                    </span>
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>

      {comparison ? (
        <>
          {projectedSeries ? (
            <section className="screen__section">
              <h2 className="screen__section-title">Runway with this purchase</h2>
              <div className="card scenario-chart">
                <CashRunwayChart
                  series={projectedSeries}
                  baseline={baselineSeries}
                  scale={sharedScale}
                  variant="hero"
                  title="Your cash runway with this hypothetical purchase, compared with the forecast without it"
                />
                <p className="runway-legend">
                  <span className="runway-legend__item">
                    <span className="runway-legend__swatch" aria-hidden="true" />
                    With this purchase
                  </span>
                  <span className="runway-legend__item">
                    <span
                      className="runway-legend__swatch"
                      data-style="dashed"
                      aria-hidden="true"
                    />
                    Without it
                  </span>
                </p>
              </div>
            </section>
          ) : null}

          <section className="screen__section">
            <h2 className="screen__section-title">Timeline with this purchase</h2>
            <Timeline forecast={comparison.projected} highlightScenario />
          </section>

          <section className="screen__section">
            <h2 className="screen__section-title">
              What this comparison does not include
            </h2>
            <ul className="bullet-list">
              {comparison.projected.missingAssumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
              <li>
                Whether this purchase is a good idea. FinAhead shows the effect on
                your projected balance; the decision is yours.
              </li>
            </ul>
          </section>
        </>
      ) : null}

      {errors.length > 0 && !showForm ? (
        <Callout tone="warning" title="FinAhead could not run that scenario">
          <ul className="error-list">
            {errors.map((error) => (
              <li key={error.code}>{error.message}</li>
            ))}
          </ul>
        </Callout>
      ) : null}
    </div>
  )
}
