import { useEffect, useRef, useState } from 'react'
import type { Transaction, ValidationError } from '../domain/types'
import { parseCsv } from '../lib/parseCsv'
import { parseMoney } from '../domain/money'
import { downloadCsv, toCsv } from '../lib/toCsv'
import { buildDemoDataset } from '../data/demoData'
import { Callout } from '../components/Callout'
import { ForecastPreview } from '../components/ForecastPreview'
import { UploadArea, type UploadStatus } from '../components/UploadArea'
import { IconArrowRight, IconShield } from '../components/icons'

interface SetupScreenProps {
  asOfDate: string
  /** True when the visitor arrived from the landing page's import link. */
  focusImport: boolean
  onUseDemo: () => void
  onUseCsv: (transactions: Transaction[], currentBalance: number) => void
}

/**
 * Step 1 — add information.
 *
 * Framed around the outcome rather than file mechanics. The sample account is
 * the recommended path and is visually primary; importing a CSV is the
 * deliberate secondary choice, since it also requires a balance the history
 * cannot supply.
 */
export function SetupScreen({
  asOfDate,
  focusImport,
  onUseDemo,
  onUseCsv,
}: SetupScreenProps) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsed, setParsed] = useState<Transaction[] | null>(null)
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [skippedBlankRows, setSkippedBlankRows] = useState(0)
  const [balanceInput, setBalanceInput] = useState('')
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const balanceRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focusImport) {
      // `nearest` so an already-visible card is not scrolled under the sticky
      // header; `scroll-margin-top` covers the case where it does scroll.
      importRef.current?.scrollIntoView({ block: 'nearest' })
      importRef.current?.querySelector<HTMLInputElement>('#csv-file')?.focus()
    }
  }, [focusImport])

  const status: UploadStatus =
    errors.length > 0 ? 'error' : parsed ? 'success' : 'idle'

  async function handleFile(file: File) {
    setFileName(file.name)
    setParsed(null)
    setErrors([])
    setBalanceError(null)

    // Read locally. There is no upload: the File API hands us the text in the
    // browser and nothing leaves the page.
    const text = await file.text()
    const result = parseCsv(text)

    setSkippedBlankRows(result.skippedBlankRows)
    if (result.errors.length > 0) {
      setErrors(result.errors)
      return
    }

    setParsed(result.transactions)
    // Move the user straight to the one thing still missing.
    window.setTimeout(() => balanceRef.current?.focus(), 0)
  }

  function submitCsv() {
    if (!parsed) return

    const balance = parseMoney(balanceInput)
    if (balance === null) {
      setBalanceError('Enter your current checking-account balance as a number.')
      balanceRef.current?.focus()
      return
    }

    setBalanceError(null)
    onUseCsv(parsed, balance)
  }

  function downloadSample() {
    // The sample is the demo account's own history, so a user can download it,
    // look at the format, and import it straight back.
    downloadCsv('finahead-sample.csv', toCsv(buildDemoDataset(asOfDate).transactions))
  }

  return (
    <div className="screen">
      <header className="screen__head">
        <h1 className="screen__title">
          See what your balance needs to cover before payday.
        </h1>
        <p className="screen__lede">
          FinAhead finds likely upcoming payments and lets you test a
          purchase&mdash;without connecting your bank.
        </p>
      </header>

      <div className="choice-grid">
        {/* Primary: the sample account -------------------------------- */}
        <section className="choice choice--primary" aria-labelledby="demo-heading">
          <div className="choice__body">
            <h2 id="demo-heading" className="choice__title">
              Explore a sample forecast
            </h2>
            <p className="text-secondary">
              New here? Start with the sample. It shows how upcoming bills and a
              hypothetical purchase change a projected pre-payday balance.
            </p>
          </div>

          <ForecastPreview asOfDate={asOfDate} showScenario={false} />

          <button type="button" className="btn btn-primary btn-block" onClick={onUseDemo}>
            Use sample account
            <IconArrowRight size={18} />
          </button>
        </section>

        {/* Secondary: import a CSV ------------------------------------ */}
        <section className="choice" aria-labelledby="import-heading" ref={importRef}>
          <div className="choice__body">
            <h2 id="import-heading" className="choice__title">
              Import transactions
            </h2>
            <p className="text-secondary">
              Bring a CSV export from your bank, then tell FinAhead your current
              balance.
            </p>
          </div>

          <UploadArea
            status={status}
            fileName={fileName}
            transactionCount={parsed?.length ?? 0}
            onFile={(file) => void handleFile(file)}
          />

          <div className="format-note">
            <p className="text-sm">Needs these four columns:</p>
            <p className="column-chips">
              <code>date</code>
              <code>merchant</code>
              <code>amount</code>
              <code>category</code>
            </p>
            <p className="text-sm">
              Dates use YYYY-MM-DD. Positive amounts are income, negative are
              expenses. Category may be blank, but the column must be there.
            </p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={downloadSample}>
              Download a sample CSV
            </button>
          </div>

          {errors.length > 0 ? (
            <Callout tone="warning" title={`Could not read ${fileName ?? 'that file'}`}>
              <p>
                Nothing was imported. Fix the rows below and choose the file again —
                FinAhead will not guess at a value it cannot read.
              </p>
              <ul className="error-list">
                {errors.slice(0, 8).map((error, index) => (
                  <li key={`${error.code}-${error.row ?? index}`}>{error.message}</li>
                ))}
              </ul>
              {errors.length > 8 ? (
                <p className="text-sm">…and {errors.length - 8} more.</p>
              ) : null}
            </Callout>
          ) : null}

          {parsed ? (
            <div className="balance-entry">
              {skippedBlankRows > 0 ? (
                <p className="text-sm text-secondary">
                  {skippedBlankRows} blank row
                  {skippedBlankRows === 1 ? ' was' : 's were'} skipped.
                </p>
              ) : null}

              <div className="field">
                <label className="field-label" htmlFor="current-balance">
                  Current checking-account balance
                </label>
                <div className="input-money" data-invalid={balanceError ? 'true' : 'false'}>
                  <span className="input-money__prefix" aria-hidden="true">
                    $
                  </span>
                  <input
                    id="current-balance"
                    className="input"
                    ref={balanceRef}
                    type="text"
                    inputMode="decimal"
                    placeholder="2140.00"
                    value={balanceInput}
                    aria-invalid={balanceError ? 'true' : undefined}
                    aria-describedby={
                      balanceError ? 'balance-error' : 'balance-hint'
                    }
                    onChange={(event) => setBalanceInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') submitCsv()
                    }}
                  />
                </div>
                {balanceError ? (
                  <span className="field-error" id="balance-error" role="alert">
                    {balanceError}
                  </span>
                ) : (
                  <span className="field-hint" id="balance-hint">
                    Your history says what leaves the account; this says what is in
                    it today.
                  </span>
                )}
              </div>

              <button type="button" className="btn btn-primary" onClick={submitCsv}>
                See my forecast
                <IconArrowRight size={18} />
              </button>
            </div>
          ) : null}
        </section>
      </div>

      <div className="privacy-strip">
        <span className="privacy-strip__icon" aria-hidden="true">
          <IconShield size={18} />
        </span>
        <div>
          <p className="privacy-strip__title">Your data stays in this browser</p>
          <p className="text-sm text-secondary">
            Your transaction file is processed locally for this session. FinAhead
            has no account system and no server to send it to.
          </p>
        </div>
      </div>
    </div>
  )
}
