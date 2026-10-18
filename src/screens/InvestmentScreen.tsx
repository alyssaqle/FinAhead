import { useMemo, useState } from 'react'
import type { InvestmentCategory, Scenario } from '../domain/types'
import { applyScenario } from '../domain/applyScenario'
import { buildForecast, type ForecastInput } from '../domain/buildForecast'
import { buildRunwaySeries, combineScale } from '../domain/buildRunwaySeries'
import {
  buildStressTable,
  describeStressTable,
  CATEGORY_LABELS,
} from '../domain/investmentStress'
import { formatCurrency, parseMoney } from '../domain/money'
import { formatDisplayDate, formatMonthDay } from '../domain/dateUtils'
import { CashRunwayChart } from '../components/CashRunwayChart'
import { Callout } from '../components/Callout'
import { IconAlert, IconArrowRight } from '../components/icons'

interface InvestmentScreenProps {
  forecastInput: ForecastInput
  /** Lifted to the app so the investment survives moving between screens. */
  investment: Scenario | null
  onInvestmentChange: (investment: Scenario | null) => void
  onBack: () => void
}

const CATEGORIES: InvestmentCategory[] = ['stock', 'etf', 'crypto', 'other']

/**
 * Investment Preflight — an optional branch off the cash forecast.
 *
 * It answers one question: if this money leaves the account today, what else
 * does it still have to cover before payday? The cash side is the ordinary
 * scenario engine — an investment is the same outflow as any other — so this
 * screen adds no forecasting of its own.
 *
 * The two halves are kept deliberately apart. Cash is what is left in the
 * account; hypothetical value is what the holding might be worth. A fall in
 * the second does not put money back into the first, and none of the stress
 * levels is a prediction: FinAhead has no market data and no view on any
 * asset.
 */
export function InvestmentScreen({
  forecastInput,
  investment,
  onInvestmentChange,
  onBack,
}: InvestmentScreenProps) {
  const baseline = useMemo(
    () => buildForecast({ ...forecastInput, scenario: null }),
    [forecastInput],
  )

  const [amount, setAmount] = useState(
    investment ? String(Math.abs(investment.amount)) : '',
  )
  const [date, setDate] = useState(investment?.date ?? forecastInput.asOfDate)
  const [category, setCategory] = useState<InvestmentCategory>(
    investment?.category ?? 'etf',
  )
  const [label, setLabel] = useState(investment?.label ?? '')
  const [isEditing, setIsEditing] = useState(investment === null)

  const outcome = useMemo(
    () => (investment ? applyScenario(forecastInput, investment) : null),
    [forecastInput, investment],
  )

  const errors = outcome?.errors ?? []
  const comparison = outcome?.comparison ?? null
  const amountError = errors.find((error) => error.field === 'amount')
  const dateError = errors.find((error) => error.field === 'date')

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

  const investedAmount = Math.abs(investment?.amount ?? 0)
  const stressRows = useMemo(
    () => (comparison ? buildStressTable(investedAmount) : []),
    [comparison, investedAmount],
  )

  function submit() {
    onInvestmentChange({
      // An empty or unreadable box is not zero; it is sent through as NaN and
      // reported by the validator rather than silently becoming 0.
      amount: parseMoney(amount) ?? Number.NaN,
      date,
      label,
      kind: 'investment',
      category,
    })
    setIsEditing(false)
  }

  function remove() {
    onInvestmentChange(null)
    setAmount('')
    setLabel('')
    setDate(forecastInput.asOfDate)
    setIsEditing(true)
  }

  const showForm = isEditing || comparison === null

  return (
    <div className="screen">
      <header className="screen__head">
        <h1 className="screen__title">
          See what investing today would change before payday.
        </h1>
        <p className="screen__lede">
          Test an amount against your upcoming obligations and explore
          hypothetical value changes. FinAhead does not recommend investments or
          predict returns.
        </p>
      </header>

      <div className="scenario-grid">
        {/* Left: the form, or a summary once it has been run -------------- */}
        <section className="card scenario-form" aria-labelledby="investment-form-title">
          <h2 id="investment-form-title" className="screen__section-title">
            {showForm ? 'Your hypothetical investment' : 'Investment'}
          </h2>

          {showForm ? (
            <>
              <div className="field">
                <label className="field-label" htmlFor="investment-amount">
                  Investment amount
                </label>
                <div
                  className="input-money"
                  data-invalid={amountError ? 'true' : 'false'}
                >
                  <span className="input-money__prefix" aria-hidden="true">
                    $
                  </span>
                  <input
                    id="investment-amount"
                    className="input"
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    aria-invalid={amountError ? 'true' : undefined}
                    aria-describedby={
                      amountError ? 'investment-amount-error' : 'investment-amount-hint'
                    }
                    onChange={(event) => setAmount(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') submit()
                    }}
                  />
                </div>
                {amountError ? (
                  <span
                    className="field-error"
                    id="investment-amount-error"
                    role="alert"
                  >
                    {amountError.message}
                  </span>
                ) : (
                  <span className="field-hint" id="investment-amount-hint">
                    Enter it as a positive number.
                  </span>
                )}
              </div>

              <div className="field">
                <label className="field-label" htmlFor="investment-date">
                  Investment date
                </label>
                <input
                  id="investment-date"
                  className="input"
                  type="date"
                  min={baseline.asOfDate}
                  max={baseline.horizonDate}
                  value={date}
                  aria-invalid={dateError ? 'true' : undefined}
                  aria-describedby={
                    dateError ? 'investment-date-error' : 'investment-date-hint'
                  }
                  onChange={(event) => setDate(event.target.value)}
                />
                {dateError ? (
                  <span className="field-error" id="investment-date-error" role="alert">
                    {dateError.message}
                  </span>
                ) : (
                  <span className="field-hint" id="investment-date-hint">
                    Between {formatDisplayDate(baseline.asOfDate)} and{' '}
                    {formatDisplayDate(baseline.horizonDate)}.
                  </span>
                )}
              </div>

              <div className="field">
                <label className="field-label" htmlFor="investment-category">
                  Category
                </label>
                <select
                  id="investment-category"
                  className="input"
                  value={category}
                  aria-describedby="investment-category-hint"
                  onChange={(event) =>
                    setCategory(event.target.value as InvestmentCategory)
                  }
                >
                  {CATEGORIES.map((option) => (
                    <option key={option} value={option}>
                      {CATEGORY_LABELS[option]}
                    </option>
                  ))}
                </select>
                <span className="field-hint" id="investment-category-hint">
                  A label for your own reference. It does not change any
                  calculation.
                </span>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="investment-label">
                  Label <span className="text-secondary">(optional)</span>
                </label>
                <input
                  id="investment-label"
                  className="input"
                  type="text"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') submit()
                  }}
                />
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
                  <dt className="label-caps">Amount</dt>
                  <dd className="tabular">{formatCurrency(investedAmount)}</dd>
                </div>
                <div>
                  <dt className="label-caps">Date</dt>
                  <dd>{formatDisplayDate(investment?.date ?? '')}</dd>
                </div>
                <div>
                  <dt className="label-caps">Category</dt>
                  <dd>
                    {CATEGORY_LABELS[investment?.category ?? 'other']}
                    {investment?.label?.trim() ? ` · ${investment.label.trim()}` : ''}
                  </dd>
                </div>
              </dl>

              <div className="scenario-form__actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsEditing(true)}
                >
                  Edit investment
                </button>
                <button type="button" className="btn btn-secondary" onClick={remove}>
                  Remove investment
                </button>
                <button type="button" className="btn btn-ghost" onClick={onBack}>
                  Back to forecast
                </button>
              </div>
            </>
          )}
        </section>

        {/* Right: the current low, then the comparison -------------------- */}
        <section className="scenario-panel" aria-live="polite">
          {comparison ? (
            <div className="compare" data-negative={comparison.goesBelowZero}>
              <p className="compare__title">
                Cash runway ·{' '}
                {CATEGORY_LABELS[investment?.category ?? 'other']}
                {investment?.label?.trim() ? ` · ${investment.label.trim()}` : ''}
              </p>

              <div className="compare__pair">
                <div className="compare__side">
                  <span className="label-caps">Projected low before</span>
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
                  <span className="label-caps">After this investment</span>
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
                Investing <strong>{formatCurrency(investedAmount)}</strong> on{' '}
                {formatMonthDay(investment?.date ?? '')} would change your
                projected pre-payday cash balance from{' '}
                <strong>{formatCurrency(comparison.baseline.lowestBalance)}</strong>{' '}
                to{' '}
                <strong>{formatCurrency(comparison.projected.lowestBalance)}</strong>.
              </p>

              {comparison.goesBelowZero ? (
                <div className="compare__warning">
                  <IconAlert size={18} />
                  <p>
                    This scenario would take your projected cash balance below $0
                    before payday. Overdraft or returned-payment fees are not
                    included in this estimate.
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
                title="Your current cash runway, before any hypothetical investment"
              />
              <p className="scenario-preview__prompt">
                Enter an amount to compare.
              </p>
            </div>
          )}
        </section>
      </div>

      {comparison && projectedSeries ? (
        <>
          <section className="screen__section">
            <h2 className="screen__section-title">Cash runway with this investment</h2>
            <div className="card scenario-chart">
              <CashRunwayChart
                series={projectedSeries}
                baseline={baselineSeries}
                scale={sharedScale}
                variant="hero"
                title="Your cash runway with this hypothetical investment, compared with the forecast without it"
              />
              <p className="runway-legend">
                <span className="runway-legend__item">
                  <span className="runway-legend__swatch" aria-hidden="true" />
                  With this investment
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

          <section className="screen__section">
            <h2 className="screen__section-title">
              Hypothetical value of the amount invested
            </h2>
            <p className="text-sm text-secondary">
              Separate from your cash. The {formatCurrency(investedAmount)} already
              left your account on {formatMonthDay(investment?.date ?? '')}; a fall
              in value here does not change the cash runway above.
            </p>

            <div className="card stress">
              <table className="stress__table">
                <caption className="visually-hidden">
                  Hypothetical value of the amount invested under four stress
                  levels. These are stress levels, not predictions.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Hypothetical change</th>
                    <th scope="col" className="stress__num">
                      Value
                    </th>
                    <th scope="col" className="stress__num">
                      Difference
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stressRows.map((row) => (
                    <tr key={row.change} data-baseline={row.change === 0}>
                      <th scope="row">{row.label}</th>
                      <td className="stress__num tabular">
                        {formatCurrency(row.value)}
                      </td>
                      <td className="stress__num tabular text-secondary">
                        {row.difference === 0 ? '—' : formatCurrency(row.difference)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="disclaimer">
              This is an educational scenario, not investment advice. Hypothetical
              value changes do not predict market performance.
            </p>
          </section>

          {/* One text equivalent carrying every figure on this screen. */}
          <p className="visually-hidden">
            Summary. Original projected low before payday{' '}
            {formatCurrency(comparison.baseline.lowestBalance)} on{' '}
            {formatDisplayDate(comparison.baseline.lowestBalanceDate)}. Projected
            low after investing {formatCurrency(investedAmount)}:{' '}
            {formatCurrency(comparison.projected.lowestBalance)} on{' '}
            {formatDisplayDate(comparison.projected.lowestBalanceDate)}. Difference{' '}
            {formatCurrency(comparison.difference)}.{' '}
            {describeStressTable(investedAmount, stressRows)}
          </p>
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
