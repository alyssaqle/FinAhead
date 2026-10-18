# FinAhead — measurement write-up

How the forecasting engine was tested, what the numbers mean, and what they do
not establish.

Two datasets are used for two different jobs. They are never mixed, and neither
is allowed to grade itself.

| | Dataset | Answers |
| --- | --- | --- |
| **External realism** | MoneyData — 6,494 real anonymised bank transactions | Does the engine read real bank data correctly? |
| **Ground truth** | Synthetic — 200 accounts, 31,098 transactions, seed `20260101` | Is the arithmetic exact? What are precision and recall? |

Reproduce with `npm run bench`. Benchmark code lives in `benchmark/` and is
imported by nothing in the application.

---

## 1. Why two datasets

Real data is realistic but unlabelled: nobody has annotated which of a stranger's
merchants are "really" recurring, so it cannot produce a trustworthy F1.
Synthetic data is labelled but only as realistic as its own assumptions.

Using either alone would be a measurement error. Real data establishes that the
system survives contact with genuine bank exports; synthetic data establishes
that the arithmetic is exact and quantifies detection against labels declared
*before* any detector ran.

## 2. Independent ground truth

The financial expectations are **not** produced by running FinAhead.

`benchmark/synthetic/reference.ts` imports nothing from `src/`. It re-implements,
from the documented rules alone, the ordering, the running balance, the low-point
search and scenario insertion/removal — entirely in **integer minor units**. All
money comparisons are exact integer equality. There is no floating-point
tolerance anywhere in the financial path, so an expected answer cannot inherit a
rounding bug from the implementation it is grading.

Detection labels are declared as each account is generated, before any detector
sees the data, and are never revised after seeing a score.

## 3. Results — financial correctness (synthetic)

| Metric | Result |
| --- | --- |
| Running-balance exact match | **1,356 / 1,356 = 100%** |
| Projected-low amount | **200 / 200 = 100%** |
| Projected-low date | **200 / 200 = 100%** |
| Same-date event ordering | **200 / 200 = 100%** |
| Scenario difference | **1,000 / 1,000 = 100%** |
| Negative-balance detection | **38 / 38 = 100%** |
| Scenario-removal restoration | **1,000 / 1,000 = 100%** |
| **Maximum monetary error** | **0 cents** |
| Hand-written edge-case fixtures | **22 / 22** |
| Malformed-input cases | **13 / 13** |

The 22 fixtures are written by hand — exact zero at the low point, a scenario
landing on payday, month-end rollover into February, leap day, year boundary,
one-cent movements, nine-figure balances, already-overdrawn accounts. Each
hand-written expectation is additionally cross-checked against the reference
engine, so a typo in a fixture fails loudly instead of passing quietly.

## 4. Results — detection (synthetic)

Scored per raw merchant descriptor, so the benchmark never adopts production's
own merchant keys as ground truth.

| | TP | FP | TN | FN | Precision | Recall | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Recurring expense | 926 | 5 | 1,786 | 154 | **0.995** | 0.857 | **0.921** |
| Income | 209 | 0 | 1,791 | 67 | **1.000** | 0.757 | **0.862** |

Reported separately on purpose. Collapsing them into one accuracy number would
hide that the two detectors fail in different directions.

**The recall gap is a design choice, not a defect.** 30% of generated accounts
are deliberate challenge cases that sit *outside* the documented thresholds:
amount drift past the 20% band, date jitter, skipped occurrences, two-occurrence
histories, near-monthly decoys. The thresholds trade recall for precision because
a forecast the user cannot audit is worse than a missing row. The five false
positives are exactly the misleading decoys the generator plants — the benchmark
caught the behaviour it was built to catch.

## 5. Results — real data (MoneyData)

**Source.** Laramee, Robert (2026), *Bank Transactions Dataset*, Mendeley Data,
V1, [doi:10.17632/dnxtg6n4rv.1](https://doi.org/10.17632/dnxtg6n4rv.1), CC BY
4.0. Companion paper: [doi:10.2312/evs.20231052](https://doi.org/10.2312/evs.20231052).
Checksum verified on download; not vendored into the repo.

**Row accounting.** 8,314 source rows → 1,747 blank, 73 rejected
(`missing-description`), **6,494 accepted**. Rejected rows are reported, never
counted as tested. 2015-01-09 → 2022-12-07, 29 categories, **894 raw descriptors
normalised to 725 merchants**, zero parser errors.

**Balance reproduction: 98.88% (6,420 / 6,493) exact, in integer pence.**

Two findings came out of getting that number, and both required reading the file
rather than trusting it:

1. **The published columns do not match the published header.** Read by raw cell
   reference, no row ever populates both the "Credit Amount" and "Balance"
   columns: 6,122 rows are `E,F` and 445 are `E,G`. Column E always holds the
   magnitude, and *the balance's column position is what encodes debit versus
   credit*. The chain only reconciles under that reading — which is itself the
   evidence the reading is right.
2. **Statement order is authoritative, not date order.** The file contains 149
   genuine chronological inversions. Reconciling in statement order gives 98.88%;
   re-sorting by date first collapses it. Sorting the data "to clean it" would
   have destroyed the signal.

73 links remain unreconciled (max delta £1,100), concentrated in `Savings`/`BP`
rows — consistent with interleaved sub-account activity. Reported, not explained
away.

## 6. Reviewed real-pattern holdout

MoneyData carries no FinAhead recurrence labels, so no F1 is computed over the
full dataset. Instead, 37 merchant patterns were hand-labelled from the full
seven-year history with written rationale, **before** detector output was
consulted. Patterns a careful reviewer could argue either way are labelled
`ambiguous` and excluded rather than forced into a bucket. The detector then sees
only a 95-day window — strictly less information than the labeller had.

| | TP | FP | TN | FN | Precision | Recall | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Recurring expense | 3 | 0 | 25 | 2 | 1.000 | 0.600 | 0.750 |
| Income | 2 | 0 | 25 | 0 | 1.000 | 1.000 | 1.000 |

Both misses are threshold behaviour, traced individually: a broadband bill whose
tariff steps 67% (outside the 20% band) and an account fee with a 36-day gap
(outside the 25–35 day window). Zero false positives — no planted near-monthly
coincidence was wrongly claimed. The salary was correctly chosen as primary
income out of 102 merchants.

**This is one anonymised account.** It is a qualitative compatibility check, not
population-level validation, and should not be quoted as a general accuracy
figure.

## 7. Performance

p50 **0.095 ms**, p95 **0.696 ms**, p99 **0.772 ms**, slowest **2.741 ms**,
**~636,000 transactions/second**. 75 warm-up iterations (3 × 25 accounts) are run
and discarded first, so JIT and first-call cost do not land in the percentiles.
Node v18.20.8, darwin arm64, single machine, single run.

## 8. Regression

188 unit tests, type check, and production build all pass, with **byte-identical
bundle hashes before and after the benchmark** — evidence that measuring the
system did not modify it. No threshold was tuned to the benchmark, and the
generator was not adjusted toward the implementation.

One defect was found and corrected *in the benchmark*, not the product: a blank-row
fixture asserted 2 skipped rows against an observed 3. On inspection the
implementation was right. It is documented in place rather than quietly fixed.

## 9. What this does not establish

- MoneyData is one account, one country, one currency.
- Synthetic detection scores measure FinAhead against *the generator's*
  assumptions about consumer finance, not against the world.
- Performance is one machine, one run.
- **Nothing here measures anything about users** — not comprehension, not time
  taken, not decisions made, not fees avoided, not investing outcomes. Those
  require a usability study with real participants, which has not been run.
