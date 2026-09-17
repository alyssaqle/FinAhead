import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PredictionEdit, Scenario, Transaction } from './domain/types'
import { todayIso } from './domain/dateUtils'
import { normalizeTransactions } from './domain/normalizeMerchant'
import { detectRecurringExpenses } from './domain/detectRecurringExpenses'
import { createManualIncomeEvent, detectIncome } from './domain/detectIncome'
import {
  buildForecast,
  resolvePredictions,
  type ForecastInput,
} from './domain/buildForecast'
import { buildDemoDataset } from './data/demoData'
import { navigate, useRoute } from './lib/router'
import { usePwaInstall } from './lib/usePwaInstall'
import { AppHeader } from './components/AppHeader'
import { Disclaimer } from './components/Disclaimer'
import { Stepper, type Stage } from './components/Stepper'
import { LandingPage } from './screens/LandingPage'
import { SetupScreen } from './screens/SetupScreen'
import { ForecastScreen } from './screens/ForecastScreen'
import { ScenarioScreen } from './screens/ScenarioScreen'

interface SessionData {
  source: 'demo' | 'csv'
  transactions: Transaction[]
  currentBalance: number
}

/**
 * Two locations: the public page at `/` and the application at `/app`.
 * Everything else is application state, not a URL.
 */
export default function App() {
  const route = useRoute()
  return route.path === '/app' ? <AppShell route={route} /> : <LandingPage />
}

/**
 * The application's only stateful component.
 *
 * Everything the user provides lives here, in memory, for the length of the
 * session: the transactions, the balance, the corrections to predictions, the
 * scenario. There is no localStorage, no sessionStorage, no cookie and no
 * network call, so a reload genuinely clears the data rather than appearing to.
 *
 * All arithmetic is delegated to the pure functions in `src/domain`. This
 * component decides what to show; it never decides what a number is.
 */
function AppShell({ route }: { route: ReturnType<typeof useRoute> }) {
  // Captured once so a session that spans midnight does not silently shift the
  // forecast under the user.
  const [asOfDate] = useState(todayIso)
  const pwa = usePwaInstall()

  const [stage, setStage] = useState<Stage>('setup')
  const [session, setSession] = useState<SessionData | null>(null)
  const [edits, setEdits] = useState<Record<string, PredictionEdit>>({})
  const [rejectedIds, setRejectedIds] = useState<string[]>([])
  const [manualIncome, setManualIncome] = useState<{
    date: string
    amount: number
  } | null>(null)
  const [scenario, setScenario] = useState<Scenario | null>(null)

  const startSession = useCallback((next: SessionData) => {
    setSession(next)
    setEdits({})
    setRejectedIds([])
    setManualIncome(null)
    setScenario(null)
    setStage('forecast')
  }, [])

  const startDemo = useCallback(() => {
    const demo = buildDemoDataset(asOfDate)
    startSession({
      source: 'demo',
      transactions: demo.transactions,
      currentBalance: demo.currentBalance,
    })
  }, [asOfDate, startSession])

  /**
   * The landing page links to `/app?start=demo` and `/app?start=import`. The
   * intent is consumed once and removed from the URL so it does not re-fire on
   * back-navigation.
   */
  const intent = route.query.get('start')
  const consumedIntent = useRef(false)
  const [importRequested, setImportRequested] = useState(false)

  useEffect(() => {
    if (consumedIntent.current || !intent) return
    consumedIntent.current = true
    if (intent === 'demo') startDemo()
    if (intent === 'import') setImportRequested(true)
    navigate('/app', { replace: true })
  }, [intent, startDemo])

  const detection = useMemo(() => {
    if (!session) return null
    const normalized = normalizeTransactions(session.transactions)
    return {
      expenses: detectRecurringExpenses(normalized, asOfDate),
      incomeResult: detectIncome(normalized, asOfDate),
    }
  }, [session, asOfDate])

  const needsManualIncome =
    detection !== null && detection.incomeResult.primary === null

  const predictions = useMemo(() => {
    if (!detection) return []
    const all = [...detection.expenses, ...detection.incomeResult.candidates]
    if (needsManualIncome && manualIncome) {
      all.push(createManualIncomeEvent(manualIncome.date, manualIncome.amount))
    }
    return all
  }, [detection, needsManualIncome, manualIncome])

  const forecastInput = useMemo<ForecastInput>(
    () => ({
      currentBalance: session?.currentBalance ?? 0,
      asOfDate,
      predictions,
      edits,
      rejectedIds,
    }),
    [session, asOfDate, predictions, edits, rejectedIds],
  )

  const forecast = useMemo(() => buildForecast(forecastInput), [forecastInput])

  const resolvedPredictions = useMemo(
    () => resolvePredictions(predictions, edits, rejectedIds),
    [predictions, edits, rejectedIds],
  )

  const excludedPredictions = useMemo(
    () => predictions.filter((prediction) => rejectedIds.includes(prediction.id)),
    [predictions, rejectedIds],
  )

  const handleEdit = useCallback((id: string, edit: PredictionEdit) => {
    setEdits((current) => ({ ...current, [id]: edit }))
  }, [])

  const handleResetEdit = useCallback((id: string) => {
    setEdits((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }, [])

  const handleReject = useCallback((id: string) => {
    setRejectedIds((current) =>
      current.includes(id) ? current : [...current, id],
    )
  }, [])

  const handleRestore = useCallback((id: string) => {
    setRejectedIds((current) => current.filter((rejected) => rejected !== id))
  }, [])

  const goToStage = useCallback(
    (next: Stage) => {
      setStage(next)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [],
  )

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <AppHeader pwa={pwa} />

      <main id="main" className="container app-main">
        <Stepper stage={stage} hasData={session !== null} onNavigate={goToStage} />

        {stage === 'setup' || !session ? (
          <SetupScreen
            asOfDate={asOfDate}
            focusImport={importRequested}
            onUseDemo={startDemo}
            onUseCsv={(transactions, currentBalance) =>
              startSession({ source: 'csv', transactions, currentBalance })
            }
          />
        ) : null}

        {stage === 'forecast' && session ? (
          <ForecastScreen
            forecast={forecast}
            predictions={resolvedPredictions}
            excluded={excludedPredictions}
            transactionCount={session.transactions.length}
            sourceLabel={
              session.source === 'demo' ? 'the sample account' : 'your imported file'
            }
            manualIncome={manualIncome}
            needsManualIncome={needsManualIncome}
            onEdit={handleEdit}
            onResetEdit={handleResetEdit}
            onReject={handleReject}
            onRestore={handleRestore}
            onSetManualIncome={(date, amount) => setManualIncome({ date, amount })}
            onClearManualIncome={() => setManualIncome(null)}
            onStartScenario={() => goToStage('scenario')}
          />
        ) : null}

        {stage === 'scenario' && session ? (
          <ScenarioScreen
            forecastInput={forecastInput}
            scenario={scenario}
            onScenarioChange={setScenario}
            onBack={() => goToStage('forecast')}
          />
        ) : null}

        <div className="app-footer">
          {session ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSession(null)
                setEdits({})
                setRejectedIds([])
                setManualIncome(null)
                setScenario(null)
                setStage('setup')
              }}
            >
              Start over with different data
            </button>
          ) : null}
          <Disclaimer />
        </div>
      </main>
    </>
  )
}
