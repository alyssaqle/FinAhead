import { IconCheck } from './icons'

export type Stage = 'setup' | 'forecast' | 'scenario'

const STEPS: { id: Stage; label: string }[] = [
  { id: 'setup', label: 'Add information' },
  { id: 'forecast', label: 'Cash forecast' },
  { id: 'scenario', label: 'What-if purchase' },
]

interface StepperProps {
  stage: Stage
  /** False until data has been loaded; later steps stay locked. */
  hasData: boolean
  onNavigate: (stage: Stage) => void
}

/**
 * A compact connected progress indicator.
 *
 * Steps the user cannot reach yet are real disabled buttons rather than hidden,
 * so the shape of the task stays visible. State is carried by the marker (a
 * number, a check, or a filled ring) and by `aria-current`, never by colour
 * alone.
 */
export function Stepper({ stage, hasData, onNavigate }: StepperProps) {
  const activeIndex = STEPS.findIndex((step) => step.id === stage)

  return (
    <nav className="stepper" aria-label="Progress">
      <ol className="stepper__list">
        {STEPS.map((step, index) => {
          const isActive = index === activeIndex
          const isComplete = index < activeIndex
          const isLocked = index > 0 && !hasData

          const state = isComplete ? 'complete' : isActive ? 'active' : 'upcoming'

          return (
            <li key={step.id} className="stepper__step" data-state={state}>
              <button
                type="button"
                className="stepper__button"
                data-state={state}
                disabled={isLocked}
                aria-current={isActive ? 'step' : undefined}
                onClick={() => onNavigate(step.id)}
              >
                <span className="stepper__marker" aria-hidden="true">
                  {isComplete ? <IconCheck size={14} /> : index + 1}
                </span>
                <span className="stepper__label">
                  <span className="stepper__index">Step {index + 1}</span>
                  <span className="stepper__name">{step.label}</span>
                </span>
                {isComplete ? (
                  <span className="visually-hidden"> (completed)</span>
                ) : null}
              </button>
              {index < STEPS.length - 1 ? (
                <span className="stepper__line" data-filled={isComplete} aria-hidden="true" />
              ) : null}
            </li>
          )
        })}
      </ol>

      {/*
        On narrow screens the per-step labels collapse to markers, so the
        current step is restated here in full. Hidden from assistive technology
        because `aria-current` on the button already conveys it.
      */}
      <p className="stepper__current" aria-hidden="true">
        Step {activeIndex + 1} of {STEPS.length} · {STEPS[activeIndex].label}
      </p>
    </nav>
  )
}
