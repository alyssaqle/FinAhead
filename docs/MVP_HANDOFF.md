# FinAhead — MVP handoff

FinAhead V1: a testable product hypothesis for five customer interviews. Not a
complete financial product.

## How to run the application

```bash
npm install
npm run dev
```

Then open the URL Vite prints (http://localhost:5173 by default) and click
**Use demo account**. No API key, no account, no setup.

Requires Node 18 or newer. Vite 5 and Vitest 2 are pinned for Node 18
compatibility.

## How to run the tests

```bash
npm test          # once
npm run test:watch
```

## How to create a production build

```bash
npm run build     # type-checks, then builds into dist/
npm run preview   # serve the built output
```

## Architecture summary

```
src/
  domain/              pure financial logic — no React, no side effects
    types.ts           Transaction, NormalizedTransaction, RecurrenceEvidence,
                       PredictedEvent, ForecastEvent, ForecastResult, Scenario,
                       ValidationError
    constants.ts       every threshold, in one place
    dateUtils.ts       ISO date arithmetic in UTC
    money.ts           rounding, median, amount spread, currency formatting
    normalizeMerchant.ts
    recurrence.ts      grouping/dedupe/interval helpers shared by the detectors
    detectRecurringExpenses.ts
    detectIncome.ts
    buildForecast.ts
    applyScenario.ts
    buildRunwaySeries.ts   forecast output -> cash-runway chart points
    __tests__/
  lib/
    parseCsv.ts        hand-written CSV reader with per-row validation
    toCsv.ts           sample-file download
    __tests__/
  data/demoData.ts     demo history, generated relative to today
  components/          presentational pieces
  screens/             the three stages
  styles/app.css       one plain stylesheet
  App.tsx              the only stateful component
```

The rule: **domain logic never imports React, and components never do
arithmetic.** A component may format a number; it may not decide what the number
is. This is what makes the financial rules testable in isolation, and it is why
all 165 tests run in a Node environment with no DOM.

Dependencies are React and React DOM. No CSV library (the accepted format is one
fixed four-column shape and the error messages are part of the product), no
chart library, no state library, no UI framework.

## Financial-calculation rules

### Money representation

Single currency (USD). Amounts are held as a number of dollars that is always an
exact multiple of one cent. Cent exactness is established at the boundaries
where a decimal enters the system — `parseMoney`, used by the CSV reader and by
every money input in the UI — and preserved afterwards by rounding to cents at
each accumulation step in the forecast engine.

`parseMoney` converts the decimal **digits** to whole cents rather than calling
`Number` first, because the string-to-double conversion is where a sub-cent
value is lost: `10.005` becomes the double `10.00499999999999989…`, and no
amount of later rounding can tell it from `10.004`. Reading the digits resolves
it by a stated rule instead — **half away from zero**, applied to the magnitude
so that the direction never depends on the sign.

Rounding happens at two boundaries only: when money is parsed, and after each
addition to a running balance. Formatting (`formatCurrency`) is separate and
never changes a value.

A dependency was evaluated and rejected — see **Why no money library** below.

### Sign convention

Positive amounts are money arriving; negative amounts are money leaving. This
holds everywhere — CSV input, predictions, timeline events. The scenario form is
the one exception the user sees: a purchase is typed as a positive number and
converted to an outflow by the engine.

### Merchant normalisation

Trim → collapse whitespace → drop payment-network prefixes (`POS DEBIT`,
`SQ *`) → strip transaction identifiers, store numbers and phone numbers →
match against a small explicit alias map (longest match wins) → otherwise title
case. `SPOTIFY USA 877-778-1161` becomes `Spotify`; `NETFLIX.COM` becomes
`Netflix`. Digits that could be part of a name are preserved (`7-Eleven`,
`Studio 54`). No fuzzy matching.

### Recurring-expense detection (monthly only in V1)

A merchant is predicted as a recurring expense only if **all** hold:

- amounts are negative
- at least 2 distinct postings (3+ for medium or high confidence)
- **every** gap between postings is 25–35 days
- amount spread `(max − min) / mean` is at most 20%

Requiring every gap to be in range — not just the median — stops a merchant with
gaps of 5 and 55 days (median 30) from being presented as a monthly bill.

The estimate is the **median** of the historical amounts. The next date advances
by calendar month from the last occurrence, clamping to the end of short months
(January 31 → February 28), and keeps advancing until it is in the future, so a
missed bill still surfaces.

Duplicate postings (identical merchant, date and amount) are collapsed before
the gaps are measured; otherwise a duplicate creates a zero-day gap and hides a
real bill.

### Income detection

Same shape, with positive amounts and two cadence windows: biweekly (12–16 days)
and monthly (25–35 days). At least 2 deposits, same 20% spread limit.

**When several deposit streams qualify**, the primary income source is the one
with the **largest total historical deposit volume** — the stream the user's
budget rests on, and a measure that is stable against a small stream that
happens to be due sooner. Ties break on: more deposits, then earlier next date,
then merchant name. Other qualifying streams still appear in the timeline and
affect the running balance; they just do not define payday.

If nothing qualifies, FinAhead reports that it could not identify the next
deposit and asks the user for a date and amount. **It never invents a payday.**

### Forecast engine

Three rules govern the output:

1. **Same-day ordering.** Events on the same date are applied expenses first,
   then income; within a kind, the larger outflow first. This is the
   conservative reading of a day — if rent and a paycheck both land on the 1st,
   the timeline shows the dip before the recovery. Order is fully determined by
   `(date, kind, amount, id)`, never by input order.
2. **The low point is measured before income.** The projected lowest balance
   considers the starting balance and every event *before* the next primary
   income event. The deposit itself and anything after it are excluded, because
   the question is "how low do I go before payday".
3. **Events on the as-of date are already spent.** Predicted charges must be
   dated strictly after today to enter the timeline, since the current balance
   already reflects today. A scenario is the exception: a purchase under
   consideration has not happened yet, so it may be dated today.

The forecast horizon is the next primary income date, or 35 days out when no
income is known. Editing or rejecting a prediction re-runs the whole
calculation; nothing is patched in place.

### Scenario engine

Validates the input, converts the amount to an outflow, runs the forecast twice
(with and without), and returns both low points, the difference, and a warning
if the projected balance drops below zero. Rejected inputs: zero, negative,
nonnumeric, a date before today, and a date after the forecast horizon.

### Why no money library

currency.js and Dinero.js were both reviewed against the Fintech Engineering
Handbook's guidance on integer minor units, rounding boundaries and safe
parsing. Neither was installed, on evidence rather than preference:

- **The accumulation hazard is already handled.** The problem currency.js exists
  to fix (`2.51 + .01` giving `2.5199999999999996`) is neutralised by rounding
  to cents after every event. A randomised probe over 3,000 transaction sets
  compared the engine's running balance against an integer-cent reference and
  found **zero** discrepancies, and `money.test.ts` keeps that pinned.
- **currency.js does not fix the defect that testing did find.** Measured over
  4,000 half-cent values, currency.js got 1,999 wrong — no better than the code
  it would have replaced — because it receives a `number` that has already lost
  the distinction. Passing it the string made no difference. Exact digit parsing
  got all 4,000 right, in about ten lines.
- **Dinero.js** models money as an immutable amount-and-currency object with
  explicit scale. That model is right for multi-currency systems; for a
  single-currency MVP it would add a wrapper type across every domain function
  to restate a constraint the type system and tests already hold. Its useful
  idea — decide the minor unit at the boundary and never leave it — was adopted
  directly.

Adopted from the Handbook: integer minor units at the boundary, rounding only at
stated boundaries, validation that rejects rather than coerces, and uncertainty
language that never presents an estimate as a fact. Not adopted: multi-currency
support, currency metadata and rounding residual accounts, none of which a
single-currency forecast has a use for.

## Demo-data explanation

`src/data/demoData.ts` generates about 95 days of history **relative to today**,
ending yesterday, so the demo never goes stale. It is a fictional recent
graduate:

- biweekly payroll around $1,410, anchored so the next payday is 13 days out
- five obligations inside the pre-payday window: rent $1,150, credit-card
  payment ~$260, gym $24.99, phone $30 and a student loan $145
- three more that land just after payday — internet $64.99, Spotify $11.99 and a
  $200 monthly transfer from a parent (a second income candidate, which
  exercises the primary-income selection rule)
- irregular groceries, coffee, delivery and rides, which must **not** be
  predicted
- one-off merchants that appear exactly once (REI, campus bookstore, CVS)
- starting balance $2,140

Recurring bills are anchored by **how many days until their next occurrence**
rather than by a fixed day of the month, with history generated by stepping back
whole calendar months from that anchor. That keeps the demonstration stable:
whatever day the demo is opened, the same five obligations fall between today and
payday, so the projected low is always **$530.02**, and a $350 purchase always
takes it to **$180.02**.

**Nothing about the demo is hard-coded downstream.** It is plain transaction
history; the same detectors and forecast engine that run on an imported CSV
produce every number on screen. `demoData.test.ts` runs the demo through the
real pipeline on seven as-of dates — including a month boundary, a year boundary
and February 29 — and asserts on properties rather than a fixed expected
forecast: that the five headline obligations land before payday, that the low
point sits in the $500–$700 band, that it equals the starting balance plus the
outflows the engine itself produced, and that a $350 purchase moves it by
exactly $350.

## Privacy behaviour

- No backend, no database, no authentication, no analytics, no third-party
  requests.
- A selected CSV is read in the browser with the File API. It is held in React
  state for the session and never transmitted.
- Nothing is written to `localStorage`, `sessionStorage` or cookies. Reloading
  the page clears everything.
- The sample-CSV download is generated in memory via a Blob object URL.

Verified in QA by asserting zero non-local network requests across a full
session and that all three browser stores are empty after a reload.

## Known limitations

1. **Monthly expenses only.** Weekly, quarterly and annual obligations are not
   detected. An annual insurance payment will not appear.
2. **Variable spending is not projected.** Groceries, coffee and one-off
   purchases are excluded by design, so the projected low balance is
   systematically *optimistic* for anyone with meaningful discretionary
   spending. This is stated on screen, but it is the biggest gap between the
   forecast and reality.
3. **One account.** No credit-card balances, savings or second checking account.
4. **The balance is self-reported** and not reconciled against the history.
5. **Two occurrences is enough** to predict. It is labelled low confidence, but
   it is thin evidence.
6. **Pending transactions** are indistinguishable from posted ones.
7. **Semi-monthly pay** (the 15th and last day of the month) is detected as
   biweekly, and the projected date can drift by a day or two.
8. **A rejected prediction cannot be re-detected** without starting over — it
   can be restored from the "Excluded by you" list within the session.
9. **No undo for a `Start over`.** The session is cleared immediately.
10. **Dates are handled in UTC**, so a user in a far-eastern timezone late at
    night may see "today" resolve to the previous date.

## Manual QA checklist

All 20 items verified in Chrome via a scripted browser session (29 assertions,
all passing), at 1280px and 390px.

| # | Check | Result |
| --- | --- | --- |
| 1 | App loads without errors | Pass — no console or page errors |
| 2 | FinAhead name and tagline correct | Pass — title, header, tagline |
| 3 | Use demo account works | Pass |
| 4 | Demo predictions come from real domain logic | Pass — covered by `demoData.test.ts` on 7 as-of dates |
| 5 | Valid CSV uploads | Pass — 9 rows, blank row skipped |
| 6 | Malformed CSV shows a clear error | Pass — missing column, invalid date, nonnumeric amount, empty file |
| 7 | Current balance can be entered | Pass |
| 8 | Upcoming transactions in chronological order | Pass |
| 9 | Running balance mathematically correct | Pass — $1,200 → $300 → $1,300 |
| 10 | Projected low point correct | Pass — $300.00 on Sep 20 |
| 11 | $350 scenario updates timeline and low point | Pass — $300 → −$50, difference −$350 |
| 12 | A prediction can be edited | Pass — badge shown, forecast recalculated |
| 13 | A prediction can be marked not recurring | Pass — excluded and restorable |
| 14 | Forecast recalculates after an edit | Pass |
| 15 | No-income state offers manual entry | Pass — and manual income becomes the horizon |
| 16 | Negative-balance warning appears | Pass |
| 17 | Refresh clears uploaded data | Pass — all browser stores empty |
| 18 | No transaction data sent over the network | Pass — zero external requests |
| 19 | Works at mobile and desktop widths | Pass — no horizontal overflow at 390px |
| 20 | Keyboard navigation reaches all key controls | Pass — demo flow completed keyboard-only |

Test and build results at handoff: **165 unit tests passing** across 9 files;
type check clean; production build clean.

## Recommended user-testing task

Give the participant the app already loaded with the demo account (or their own
CSV, if they brought one) and read this aloud:

> "This is your account. You are considering a $350 weekend trip. Using this
> app, work out what your lowest balance would be before your next paycheck if
> you buy it."

Then stop talking. Do not point at anything. Time from the end of the sentence
to a stated answer, and note whether the answer is correct.

## Questions to ask after testing

**On the task**
1. Walk me through how you got to that number.
2. What does "projected lowest balance" mean to you, in your own words?
3. Which date is that number for, and why that date?

**On trust**
4. How much would you trust this number? What would make you trust it more?
5. Was anything here wrong about your money? What?
6. Did you notice you could see why something was predicted? Did you look?
7. What do you think this app does *not* know about your finances?

**On the decision**
8. Would this change how you made that decision? How?
9. What would you want it to tell you that it does not?
10. If it had just said "you can safely spend $420", how would you feel about
    that? *(This is the safe-to-spend hypothesis. Ask it last so it does not
    frame everything before it.)*

**On fit**
11. When in the last month would you have opened this?
12. What do you do today instead?

## Future ideas that were deliberately not built

Recorded, not implemented. Do not build these without interview evidence.

- Safe-to-spend number (the hypothesis under test)
- Weekly, quarterly and annual recurrence detection
- Projecting variable spending from historical averages
- Bank connection (Plaid) or any backend
- Multiple accounts and credit-card balances
- Saving a session, or persisting corrections across visits
- Confidence expressed as a percentage or range
- "What if I move this bill?" — rescheduling rather than adding
- Multiple simultaneous what-if purchases
- Recurring-transfer or savings-goal scenarios
- Alerts before a projected low point
- Charts
- Categories and budgeting
- Export of the forecast
- Mobile app
- Accounts, login, sharing

## Issues to evaluate after interviews

**Important** (harms usability, does not block the core task)

1. **Variable spending is invisible in the forecast.** The projected low balance
   is optimistic by however much the user spends day to day. Worth watching
   whether participants notice unprompted; the fix (an optional "typical
   spending" line) trades auditability for accuracy and should not be built on
   a hunch.
2. **The what-if is limited to the current pay period.** A purchase after the
   next payday is rejected rather than forecast further out. If users try this,
   the horizon needs to extend.
3. **Predictions after the forecast window** are shown in a separate section.
   It resolved a real confusion in review, but the section is long on the demo
   account and may still be noise.
4. **A CSV is rejected whole on any bad row.** Correct for financial integrity,
   possibly frustrating for a 400-row export with one broken line.
5. **No way to add a known upcoming expense** that is not in the history — the
   car repair the user already knows about.

**Nice to have**

6. Editing a prediction always updates both amount and date; there is no
   "just this once" versus "from now on".
7. The as-of date cannot be changed.
8. Confidence is three words; some users may want the underlying numbers up
   front rather than in the disclosure.
9. Long merchant names can wrap awkwardly in narrow timeline rows.
