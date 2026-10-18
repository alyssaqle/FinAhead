# FinAhead benchmark

Measurement only. Nothing here is imported by the application, and nothing here
changes FinAhead's behaviour.

Two datasets, used for different things:

| | Purpose | What it can support |
| --- | --- | --- |
| **MoneyData** (real, anonymised) | External realism and schema compatibility | Does FinAhead read real bank data correctly? |
| **Synthetic** (generated, seeded) | Independently labelled ground truth | Is the arithmetic exact? What are precision and recall? |

## Running

```bash
npm run bench              # both
npm run bench:synthetic    # no download needed
npm run bench:moneydata    # needs the dataset first (see below)
```

Output JSON goes to stdout. The generated dataset and manifest are written to
`benchmark/synthetic/.out/` and are regenerable byte-for-byte from the seed.

## MoneyData

```bash
node benchmark/moneydata/fetch.mjs
```

- **Title** Bank Transactions Dataset (MoneyData)
- **Author** Laramee, Robert — University of Nottingham
- **Version** 1, published 2026-01-14
- **DOI** [10.17632/dnxtg6n4rv.1](https://doi.org/10.17632/dnxtg6n4rv.1)
- **Paper** <https://doi.org/10.2312/evs.20231052>
- **Licence** CC BY 4.0 — redistribution and research/software-testing use are
  permitted with attribution
- **File** `laramee26openBankTransactionData.xlsx`, 507,389 bytes
- **sha256** `716eaf9ad4a3cf60dc9c9c8a20ed9a917c545a1b5f139f40ed91d2104faa3ff7`

> Laramee, Robert (2026), "Bank Transactions Dataset", Mendeley Data, V1,
> doi: 10.17632/dnxtg6n4rv.1 (CC BY 4.0)

The licence would permit committing the file, but it is kept untracked anyway
(`benchmark/**/.data/`): it is one person's real account history, and fetching
it is cheap. No attempt is made to de-anonymise it, and no personal data is
extracted from it.

`adapt.mjs` documents every mapping decision, including the one that matters
most: the published columns do not match the published header, and the balance
column position is what encodes debit vs credit.

## Synthetic

- Seed `20260101`, 200 accounts, 31,098 transactions, 1,000 scenarios
- 30% of accounts are challenge cases (amount drift past the threshold, date
  jitter, skipped occurrences, two-occurrence histories, misleading
  near-monthly decoys, merchant-name variants, variable income)
- `generate.ts` declares every label **before** any detector runs
- `reference.ts` imports nothing from `src/` and works only in integer minor
  units; it is the ground truth for all financial comparisons
- `fixtures.ts` holds 22 hand-written edge cases whose expected values were
  worked out by hand, then cross-checked against the reference

Money is compared as exact integers. There is no floating-point tolerance
anywhere in the financial comparisons.

## What this does not establish

- MoneyData is **one** anonymised account. The reviewed-pattern results are a
  qualitative compatibility check, not population-level validation.
- The synthetic data is generated from assumptions about how consumer finances
  look. Detection scores measure FinAhead against *those assumptions*, not
  against the real world.
- Nothing here measures anything about users: not comprehension, not time
  taken, not decisions made, not money saved. Those need a usability study with
  real participants.
