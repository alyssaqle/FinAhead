/**
 * The public page at `/`.
 *
 * Its job is narrow: explain the gap between a bank balance and what is about
 * to happen to it, show the real product, and hand the visitor into the working
 * app. Deliberately short — no pricing, no testimonials, no logo wall, no
 * claims FinAhead cannot support.
 */

import { Link } from '../lib/router'
import { SiteHeader } from '../components/SiteHeader'
import { BrandLockup } from '../components/BrandMark'
import { ForecastPreview } from '../components/ForecastPreview'
import {
  IconArrowRight,
  IconBrowser,
  IconEvidence,
  IconShield,
} from '../components/icons'
import { DISCLAIMER } from '../domain/constants'
import { todayIso } from '../domain/dateUtils'
import { buildDemoForecast } from '../data/demoForecast'
import { formatCurrency } from '../domain/money'

const TRUST_ITEMS = [
  {
    icon: IconShield,
    title: 'No bank connection',
    body: 'Nothing to link, and no credentials to hand over.',
  },
  {
    icon: IconBrowser,
    title: 'Processed in your browser',
    body: 'Your file is read on this device for the current session.',
  },
  {
    icon: IconEvidence,
    title: 'Explainable predictions',
    body: 'Every predicted payment shows the history behind it.',
  },
]

const STEPS = [
  {
    title: 'Start with sample data or import a CSV',
    body: 'Open the sample account, or bring a transaction export from your bank.',
  },
  {
    title: 'Review likely upcoming cash flow',
    body: 'FinAhead finds the payments that repeat and lays out what happens before your next deposit.',
  },
  {
    title: 'Test a purchase before making it',
    body: 'Add a hypothetical amount and see how your projected low point changes.',
  },
]

export function LandingPage() {
  const asOfDate = todayIso()
  // The figures in the problem section are the sample account's own, so the
  // page cannot quote a number the product does not produce.
  const { forecast } = buildDemoForecast(asOfDate)

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />

      <main id="main">
        {/* Hero ------------------------------------------------------- */}
        <section className="hero">
          <div className="container hero__inner">
            <div className="hero__copy">
              <p className="eyebrow">Forward-looking cash clarity</p>
              <h1 className="hero__title">Know what&rsquo;s ahead before payday.</h1>
              <p className="hero__lede">
                FinAhead turns recent transactions into an explainable cash forecast,
                so you can see how upcoming bills and purchases may change your
                balance.
              </p>

              <div className="hero__actions">
                <Link to="/app?start=demo" className="btn btn-primary btn-lg">
                  Explore a sample forecast
                  <IconArrowRight size={18} />
                </Link>
                <Link to="/app?start=import" className="btn btn-secondary btn-lg">
                  Import transactions
                </Link>
              </div>

              <p className="hero__trust">
                <IconShield size={16} />
                No signup. No bank connection. Your data stays in this browser.
              </p>
            </div>

            <div className="hero__preview">
              <ForecastPreview asOfDate={asOfDate} />
            </div>
          </div>
        </section>

        {/* Trust strip ------------------------------------------------ */}
        <section className="trust-strip" aria-label="How FinAhead works with your data">
          <div className="container trust-strip__inner">
            {TRUST_ITEMS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="trust-item">
                <span className="trust-item__icon">
                  <Icon size={18} />
                </span>
                <div>
                  <p className="trust-item__title">{title}</p>
                  <p className="text-sm text-secondary">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Problem ---------------------------------------------------- */}
        <section className="section">
          <div className="container problem">
            <div className="problem__copy reading">
              <h2 className="section-heading">
                Your current balance is only the starting point.
              </h2>
              <p className="section-intro">
                The number in your banking app is true right now, and it already
                belongs to rent, a card payment, your phone bill and the loan that
                clears next week. The question that actually decides a purchase is
                what is left after all of that, and before your next deposit.
              </p>
              <p className="section-intro">
                Most people work it out from memory or a calculator, every single
                time. FinAhead does that arithmetic from your own history and shows
                its work.
              </p>
            </div>

            <div className="beforeafter" aria-label="Balance today compared with the projected low before payday">
              <div className="beforeafter__item">
                <span className="label-caps">Balance today</span>
                <span className="beforeafter__amount tabular">
                  {formatCurrency(forecast.startingBalance)}
                </span>
              </div>
              <span className="beforeafter__divider" aria-hidden="true">
                <IconArrowRight size={20} />
              </span>
              <div className="beforeafter__item beforeafter__item--focus">
                <span className="label-caps">Projected low before payday</span>
                <span className="beforeafter__amount tabular">
                  {formatCurrency(forecast.lowestBalance)}
                </span>
                <span className="text-sm text-secondary">
                  after{' '}
                  {forecast.events.filter((event) => event.kind === 'expense').length}{' '}
                  upcoming obligations
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* How it works ----------------------------------------------- */}
        <section className="section section--sunken" id="how-it-works">
          <div className="container">
            <h2 className="section-heading">How it works</h2>
            <ol className="steps-list">
              {STEPS.map((step, index) => (
                <li key={step.title} className="step-item">
                  <span className="step-item__number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <h3 className="step-item__title">{step.title}</h3>
                  <p className="text-secondary text-15">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Transparency ------------------------------------------------ */}
        <section className="section">
          <div className="container transparency">
            <div className="transparency__copy">
              <h2 className="section-heading">Predictions you can inspect and correct.</h2>
              <p className="section-intro">
                A forecast you cannot check is just a guess with better typography.
                Every predicted payment in FinAhead shows the transactions it came
                from, how far the amount has moved, and how confident that evidence
                makes it.
              </p>
              <p className="section-intro">
                If something is wrong, change it. Edit the amount or the date, or
                mark it as not recurring, and the whole forecast recalculates.
              </p>
            </div>

            <div className="prediction-sample">
              <div className="prediction-sample__head">
                <div>
                  <p className="prediction-sample__name">Spotify</p>
                  <p className="text-sm text-secondary">Expected October 12</p>
                </div>
                <span className="tabular prediction-sample__amount">
                  approximately $11.99
                </span>
              </div>
              <div className="row">
                <span className="badge">Predicted</span>
                <span className="badge">Expense</span>
                <span className="badge badge-green">Strong evidence</span>
              </div>
              <p className="text-sm text-secondary">
                Based on payments from July 12, August 12 and September 12.
              </p>
              <div className="prediction-sample__actions" aria-hidden="true">
                <span className="btn btn-secondary btn-sm">View evidence</span>
                <span className="btn btn-secondary btn-sm">Edit</span>
                <span className="btn btn-secondary btn-sm">Not recurring</span>
              </div>
            </div>
          </div>
        </section>

        {/* Privacy ----------------------------------------------------- */}
        <section className="section section--sunken" id="privacy">
          <div className="container privacy">
            <div className="reading stack stack-4">
              <h2 className="section-heading">
                Your transaction file stays in your browser.
              </h2>
              <p className="section-intro">
                FinAhead reads the file locally for the current session. It does not
                require an account or send the file to a FinAhead server.
              </p>
              <p className="section-intro">
                There is no backend and no database. Closing or reloading the page
                clears what you loaded.
              </p>
              <p className="disclaimer">{DISCLAIMER}</p>
            </div>
          </div>
        </section>

        {/* Final CTA --------------------------------------------------- */}
        <section className="section">
          <div className="container final-cta">
            <h2 className="section-heading">
              See what your balance could look like before payday.
            </h2>
            <div className="hero__actions">
              <Link to="/app?start=demo" className="btn btn-primary btn-lg">
                Try the sample account
                <IconArrowRight size={18} />
              </Link>
              <Link to="/app?start=import" className="btn btn-secondary btn-lg">
                Import transactions
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container site-footer__inner">
          <div className="stack stack-2">
            <BrandLockup />
            <p className="text-sm text-secondary">See your balance before payday.</p>
          </div>
          <div className="site-footer__meta">
            <a href="#privacy">Privacy</a>
            <span className="text-sm text-secondary">Not financial advice</span>
            <span className="text-sm text-secondary">
              &copy; {new Date().getFullYear()} FinAhead
            </span>
          </div>
        </div>
      </footer>
    </>
  )
}
