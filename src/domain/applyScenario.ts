/**
 * The what-if engine.
 *
 * A pure function over the same inputs as the forecast: it validates the
 * hypothetical purchase, converts it to an outflow, runs the forecast twice —
 * once without it and once with it — and reports the difference between the two
 * projected low points.
 *
 * It reports the change and stops there. It never says whether the purchase is
 * affordable, wise or safe; that judgement belongs to the user, who is the only
 * one who knows what is not in this data.
 */

import type {
  ForecastResult,
  ScenarioComparison,
  Scenario,
  ValidationError,
} from './types'
import { buildForecast, type ForecastInput } from './buildForecast'
import { formatDisplayDate, isValidIsoDate } from './dateUtils'
import { roundMoney } from './money'

export interface ScenarioOutcome {
  /** Problems with the scenario. Non-empty means `comparison` is null. */
  errors: ValidationError[]
  /** The before/after comparison, or null when the scenario was rejected. */
  comparison: ScenarioComparison | null
}

/**
 * Check a scenario against the forecast it will be dropped into.
 *
 * `baseline` is needed because "is this date inside the forecast?" can only be
 * answered relative to the horizon, which is the user's next payday.
 */
export function validateScenario(
  scenario: Scenario,
  baseline: ForecastResult,
): ValidationError[] {
  const errors: ValidationError[] = []

  if (!Number.isFinite(scenario.amount)) {
    errors.push({
      field: 'amount',
      code: 'invalid-amount',
      message: 'Enter the amount as a number, for example 350.',
    })
  } else if (scenario.amount === 0) {
    errors.push({
      field: 'amount',
      code: 'zero-amount',
      message: 'Enter an amount greater than zero to see its effect.',
    })
  } else if (scenario.amount < 0) {
    errors.push({
      field: 'amount',
      code: 'negative-amount',
      message:
        'Enter the purchase as a positive number. FinAhead subtracts it from your balance for you.',
    })
  }

  if (!isValidIsoDate(scenario.date)) {
    errors.push({
      field: 'date',
      code: 'invalid-date',
      message: 'Choose a date for this purchase.',
    })
  } else if (scenario.date < baseline.asOfDate) {
    errors.push({
      field: 'date',
      code: 'date-in-past',
      message: `Choose a date on or after ${formatDisplayDate(
        baseline.asOfDate,
      )}. A purchase in the past is already part of your current balance.`,
    })
  } else if (scenario.date > baseline.horizonDate) {
    errors.push({
      field: 'date',
      code: 'date-outside-forecast',
      message: `This forecast runs to ${formatDisplayDate(
        baseline.horizonDate,
      )}. Choose a date on or before then to see the effect before your next income deposit.`,
    })
  }

  return errors
}

export function applyScenario(
  input: ForecastInput,
  scenario: Scenario,
): ScenarioOutcome {
  // The baseline is always computed without the scenario, so the comparison is
  // against what the user saw on the forecast screen.
  const baseline = buildForecast({ ...input, scenario: null })

  const errors = validateScenario(scenario, baseline)
  if (errors.length > 0) {
    return { errors, comparison: null }
  }

  const projected = buildForecast({ ...input, scenario })

  const goesBelowZero =
    projected.lowestBalance < 0 ||
    projected.events.some((event) => event.balanceAfter < 0)

  // Only flag the scenario as the cause when the baseline stayed above zero;
  // otherwise the forecast's own negative-balance warning already covers it.
  const baselineBelowZero =
    baseline.lowestBalance < 0 ||
    baseline.events.some((event) => event.balanceAfter < 0)

  if (goesBelowZero && !baselineBelowZero) {
    projected.warnings.push({
      code: 'scenario-below-zero',
      message:
        'With this purchase, your projected balance drops below zero before your next income deposit.',
    })
  }

  return {
    errors: [],
    comparison: {
      baseline,
      projected,
      difference: roundMoney(projected.lowestBalance - baseline.lowestBalance),
      goesBelowZero,
    },
  }
}
