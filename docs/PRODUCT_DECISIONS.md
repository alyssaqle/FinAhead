# FinAhead — Product decisions

## 1. Product name and tagline

**FinAhead** — *See your balance before payday.*

FinAhead forecasts upcoming cash obligations and shows how a purchase could
affect a user's balance before their next income deposit.

## 2. Target user

College students and recent graduates who manage their own bills and spending.
They have a checking account, a small number of fixed obligations (rent, phone,
a subscription, a loan payment, a credit-card payment) and income that arrives
on a schedule they know. They are not managing investments or complex finances.

What makes them the right user for this: their balance swings by a large
*fraction* between paydays, their fixed obligations are a big share of their
income, and they have little or no buffer. A $350 decision genuinely matters,
and getting it wrong costs an overdraft fee.

## 3. Problem statement

A banking app shows a current balance. That number is true and, for a spending
decision, close to useless: it does not account for the rent, subscriptions,
bills, credit-card payment or income that are about to move through the account.

So users do the forecast themselves — from memory, in a notes app, on a
calculator, or by guessing. The mental arithmetic is not hard; it is just
tedious and easy to get wrong, and it has to be redone every time.

## 4. Job to be done

> When I am considering a discretionary purchase or savings transfer, help me
> understand my expected cash position before my next income deposit so I can
> make the decision myself.

The last five words are the constraint the product is built around.

## 5. Initial hypothesis

The starting hypothesis was that **users want a single "safe-to-spend" number**.

This MVP deliberately does not build that, for two reasons.

First, it is unverified. It is the kind of hypothesis that sounds obviously true
and is exactly what five interviews exist to test. Building the product around
it would destroy the evidence.

Second, a safe-to-spend number is only correct if the forecast behind it is
complete, and it cannot be. FinAhead sees whatever history the user supplied. It
does not know about the car repair next week, the friend paying them back, or
the second account. A single number hides that uncertainty at exactly the moment
it matters, and the user cannot tell a well-evidenced number from a guess.

So V1 optimises for **transparency and user control** instead: show the
projection, show the evidence, let the user correct it, and let them decide.

## 6. Three concepts considered

### Concept A — Cash calendar

A month view with predicted transactions on their dates.

*For:* familiar; good for "when is rent due"; browsable.
*Against:* it answers "what happens when" but not "what happens if". The user
still has to do the running-balance arithmetic in their head, which is the
actual work. A calendar grid is also poor on a phone, which is where this
decision gets made.

### Concept B — What-if simulator

A forecast timeline with a running balance, plus a hypothetical purchase that
can be dropped into it.

*For:* directly matches the job to be done. The output is a comparison ("from X
to Y"), not a verdict, so the product stays on the right side of the advice
line. Every number is traceable to a real transaction.
*Against:* requires the user to have a purchase in mind; more screens than a
single number; the value depends on prediction quality being visibly good.

### Concept C — Safe-to-spend number

One figure: "You can safely spend $420."

*For:* effortless; instantly understandable; the strongest demo.
*Against:* it is a recommendation. It states as fact something the app cannot
know, it hides every assumption, it gives the user no way to notice when it is
wrong, and it is wrong whenever the history is incomplete — which is most of the
time. It also invites reliance in precisely the situation where being wrong is
expensive.

## 7. V1 choice

**Concept B, the what-if simulator**, with the forecast timeline as the screen
the user lands on.

It is the only one of the three that answers the actual question, and it is the
only one that can be wrong *visibly*. When FinAhead predicts rent at $1,150 on
October 1, the user sees the three payments that produced that estimate and can
fix it in two clicks. That correction is also the most valuable thing the MVP
can learn from: a high correction rate means the detection rules are wrong, and
that shows up in the product rather than being silently absorbed.

The framing is consistent throughout: *projected lowest balance*, *estimated
upcoming payment*, *based on three previous payments*, *with this purchase, your
projected lowest balance changes from X to Y*. FinAhead never says "you can
afford this", "you can safely spend", or "you should".

## 8. Explicitly deprioritised

Cut deliberately, not for lack of time:

- **Safe-to-spend recommendation** — the hypothesis under test; see §5.
- **Bank connection (Plaid) and any backend** — the MVP needs to prove that the
  forecast is *useful*, not that data can be ingested. CSV and a demo account
  test the idea at a fraction of the cost, with no credentials and no liability
  for holding financial data.
- **Weekly and annual recurrence** — monthly covers rent, subscriptions, phone,
  loan and card payments, which is most of a young adult's fixed cost. Weekly
  detection mostly catches variable spending, which should not be predicted.
- **Variable-spending projection** (groceries, coffee) — modelling it means
  averaging, which means a number with no auditable evidence behind it. It is
  called out as a known gap instead of guessed at.
- **Multiple accounts, credit-card balances, savings goals, budgeting
  categories** — each is a different product.
- **Charts** — a timeline with a running balance is more precise than a line
  graph and reads better on a phone.
- **Persistence, accounts, dark mode, notifications** — no user need
  demonstrated yet, and persistence would weaken the privacy story.

## 9. Deterministic versus LLM

FinAhead contains no LLM, no AI API and no model of any kind. Claude Code was
used to *build* it; it is not in the product.

Every financial calculation is a pure function over typed inputs:

- **Reproducible** — the same inputs always produce the same forecast.
- **Auditable** — every predicted number traces to specific source transactions,
  and the UI shows them.
- **Testable** — 165 unit tests cover the rules directly, including the
  boundaries (month-end dates, leap years, same-day events, duplicate postings).
- **Explainable** — "based on payments from July 1, August 1 and September 1" is
  a true statement about the data, not a generated rationalisation.

An LLM could not meet any of those four requirements here. A model asked to
estimate next month's rent would produce a plausible number that cannot be
verified, cannot be reproduced, and would occasionally be confidently wrong
about someone's money. The arithmetic is not the hard part of this product;
being trustworthy about it is.

A defensible future use of an LLM is merchant-name normalisation, where errors
are cosmetic and recoverable. Even there, a deterministic alias map is cheaper
and easier to correct.

## 10. Safety and trust risks

| Risk | How V1 handles it |
| --- | --- |
| **The forecast is read as advice** | No recommendation language anywhere; a persistent disclaimer; the what-if screen states plainly that the decision is the user's. |
| **A prediction is wrong and the user relies on it** | Every prediction is labelled a prediction, shows its evidence and confidence, and can be edited or removed in two clicks. |
| **The forecast looks complete but is not** | A "what this forecast does not include" section on both result screens, naming variable spending and any rejected predictions explicitly. |
| **A payday is invented** | If no repeating deposit qualifies, FinAhead says so and asks the user rather than guessing. There is no fallback income estimate. |
| **False precision** | Amounts are shown as "approximately"; confidence is stated in words ("based on only 2 previous payments") rather than as a fake percentage. |
| **Financial data leaking** | No backend, no storage, no analytics, no network calls. Verified in QA by asserting zero external requests and empty browser storage. |
| **Malformed data silently corrupted** | A CSV with any unreadable row is rejected whole, with per-row errors. Nothing is coerced or dropped quietly. |
| **Overdraft risk understated** | A projected balance below zero is called out in red, and the app notes that overdraft fees are not included. |

An honest residual risk: the demo account is clean, so the forecast looks more
reliable in a demo than it will on real, messy data. Interviews should use the
participant's own mental model of their bills, not the demo's.

## 11. Metrics for user testing

Initial metrics for the first five interviews:

1. **Task success** — percentage of users who correctly identify the projected
   low balance after a hypothetical purchase.
2. **Time to answer** — how long it takes to answer the scenario question.
3. **Confidence in the forecast** — self-reported, 1–5.
4. **Activation** — data selected or uploaded → forecast viewed → scenario
   completed, as a funnel.
5. **Prediction-correction rate** — share of predictions edited or rejected.
   High means the detection rules are wrong; zero may mean the evidence is not
   being read at all.
6. **Forecast error** — predicted low point versus actual, once real
   longitudinal data is available.

With n=5, these are qualitative signals, not statistics. The most informative
are (1), because it tests whether the core number is legible at all, and (5),
because it is the only direct evidence about prediction quality.

---

# Investment Preflight

An optional branch off the cash forecast, added after the V1 flow was working.

## Target user

The same college student or recent graduate, at a specific moment: they have
$50–$500 they are thinking of putting into a brokerage or exchange app for the
first time, and they have bills between now and payday. They are not choosing
between assets — they have usually already decided *what* — they are deciding
*whether now*, and they have no way to see what that money is still on the hook
for.

## Problem hypothesis

The apps that take the money are very good at the moment of transfer and silent
about everything downstream of it. A first-time investor sees the amount leave
one balance and appear in another, and nothing anywhere connects that to the
rent due in nine days. The hypothesis is that the useful intervention is not
advice about the investment — it is making the *cash consequence* visible in the
same place they already read their runway.

This is a hypothesis. It has not been tested with anyone.

## Why a preflight rather than a trading simulator

A simulator answers "what might this be worth?" That question requires a view on
market behaviour, which FinAhead does not have and should not fake. Any number
it produced would be a prediction dressed as a feature, and a first-time
investor is exactly the person least equipped to discount it.

A preflight answers a question FinAhead *can* answer from data the user already
gave it: if this money leaves today, what else does it still have to cover? The
cash side is arithmetic over their own transactions, and it reuses the existing
scenario engine unchanged — a hypothetical investment is the same outflow as a
hypothetical purchase.

The value side is deliberately the crudest thing that is still honest: four
fixed decline levels, no probabilities, no time horizon, no asset-specific
behaviour. It exists to make one point — that the money can be worth less and
the bills stay the same — and it is kept visually and structurally separate from
the cash runway so the two are never read as one number. The category field is
descriptive metadata and never reaches a calculation, because FinAhead has no
basis for treating crypto differently from an ETF.

## What remains unvalidated

Everything about whether this is wanted. Specifically:

- Whether students facing this decision would look for a tool at all, rather
  than just transferring the money.
- Whether the cash consequence is the part they find unclear, or whether they
  already know it and the anxiety is elsewhere.
- Whether four decline levels read as "this can go down" or as a prediction that
  it will, which would be a failure.
- Whether keeping cash and hypothetical value apart actually lands, or whether
  users mentally add them back together.
- Whether $50–$500 is the right range, or whether the real moment is smaller and
  more frequent.
- Whether offering this at all makes FinAhead feel like it is nudging toward
  investing, which would undermine the product's stance.

No user research has been carried out on this feature. Nothing here should be
cited as validated.

## Suggested research metrics

1. **Discovery** — share of forecast-screen sessions that open the preflight
   without prompting.
2. **Comprehension** — after using it, can the participant state, unprompted,
   both their post-investment low *and* that the stress levels are not
   predictions? Failing the second half is the signal that matters.
3. **Separation** — asked "how much money do you have," do they answer with the
   cash low, or with cash plus hypothetical value?
4. **Amount realism** — distribution of entered amounts against the $50–$500
   assumption.
5. **Decision change** — self-reported, whether seeing it changed the amount or
   the timing. Reported as a qualitative signal, never as a conversion rate.
6. **Perceived stance** — does the feature read as neutral, encouraging, or
   discouraging? A product that reads as encouraging has drifted.

## Explicit MVP exclusions

Not built, and not to be added without evidence: recurring or scheduled
investments, live or historical prices, real or simulated returns, gains,
dividends, fees, taxes, settlement, selling, withdrawal, portfolio tracking,
asset comparison, risk scoring, time horizons, probability or confidence
figures, brokerage or bank connectivity, and any recommendation about whether,
what, or how much to invest.
