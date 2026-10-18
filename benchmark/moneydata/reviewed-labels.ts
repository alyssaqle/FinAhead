/**
 * Phase 3b — small reviewed holdout from MoneyData.
 *
 * LIMITATION, STATED UP FRONT: this is 36 hand-reviewed merchant patterns from
 * ONE anonymised UK current account. It is a qualitative compatibility check,
 * not population-level validation of FinAhead's detectors, and the numbers
 * below must not be presented as a general accuracy figure.
 *
 * HOW THESE LABELS WERE MADE
 *
 * Labels were assigned by reading the merchant's behaviour across the FULL
 * seven-year history — occurrence count, interval pattern, amount stability,
 * the dataset's own category, and whether the money moves in or out — and then
 * asking a human question: "is this a payment that repeats on a monthly
 * schedule, an income stream, or neither?"
 *
 * FinAhead's detector output was NOT consulted when labelling, and no label was
 * changed after seeing a score. Patterns that a careful reviewer could argue
 * either way are labelled `ambiguous` and excluded from the confusion matrix
 * rather than forced into a bucket.
 *
 * The detector is then run over a 95-day window only — the observation period
 * the product actually uses — while the labels draw on the whole history. The
 * detector therefore has strictly less information than the labeller, which is
 * the realistic condition.
 *
 * Window: 2022-04-22 .. 2022-07-26 (as-of), 311 transactions, 102 merchants.
 */

export type Label = 'recurring-expense' | 'income' | 'neither' | 'ambiguous'

export interface ReviewedPattern {
  /** Normalised merchant key, as FinAhead's own normaliser produces it. */
  merchantKey: string
  display: string
  label: Label
  /** Why a human assigned this label, from the full history. */
  rationale: string
  /** Supporting evidence recorded at labelling time. */
  evidence: {
    occurrencesInWindow: number
    occurrencesInFullHistory: number
    windowIntervalsDays: number[]
    amountRange: [number, number]
    datasetCategory: string
    fullHistorySpanDays: number
  }
}

export const REVIEW_WINDOW = { start: '2022-04-22', asOf: '2022-07-26' }

export const REVIEWED_PATTERNS: ReviewedPattern[] = [
  // ---- fixed monthly obligations -----------------------------------------
  {
    merchantKey: 'audible uk', display: 'Audible UK', label: 'recurring-expense',
    rationale: 'Identical £7.99 charge 41 times over 973 days at ~30-day spacing. A subscription by any reading.',
    evidence: { occurrencesInWindow: 4, occurrencesInFullHistory: 41, windowIntervalsDays: [29, 31, 31], amountRange: [7.99, 7.99], datasetCategory: 'Entertainment', fullHistorySpanDays: 973 },
  },
  {
    merchantKey: 'o2', display: 'O2', label: 'recurring-expense',
    rationale: 'Mobile network, 84 charges over 2527 days, ~31-day spacing, amount stable at £17.95–18.01.',
    evidence: { occurrencesInWindow: 3, occurrencesInFullHistory: 84, windowIntervalsDays: [31, 32], amountRange: [17.95, 18.01], datasetCategory: 'Other Shopping', fullHistorySpanDays: 2527 },
  },
  {
    merchantKey: 'virgin media pymts', display: 'Virgin Media Pymts', label: 'recurring-expense',
    rationale: 'Broadband bill, 71 charges over 2523 days at ~31-day spacing. The amount steps between tariffs (£25.50–£56.25), but it is unambiguously a monthly bill.',
    evidence: { occurrencesInWindow: 3, occurrencesInFullHistory: 71, windowIntervalsDays: [31, 31], amountRange: [25.5, 56.25], datasetCategory: 'Bills', fullHistorySpanDays: 2523 },
  },
  {
    merchantKey: 'hpi instant ink uk', display: 'HPI Instant INK UK', label: 'recurring-expense',
    rationale: 'Printer-ink subscription, flat £4.49, 18 charges over 513 days at ~30-day spacing.',
    evidence: { occurrencesInWindow: 3, occurrencesInFullHistory: 18, windowIntervalsDays: [32, 29], amountRange: [4.49, 4.49], datasetCategory: 'Other Shopping', fullHistorySpanDays: 513 },
  },
  {
    merchantKey: 'club lloyds fee', display: 'Club Lloyds FEE', label: 'recurring-expense',
    rationale: 'Flat £3.00 monthly account fee, 50 charges over 1579 days. A fixed monthly obligation.',
    evidence: { occurrencesInWindow: 2, occurrencesInFullHistory: 50, windowIntervalsDays: [36], amountRange: [3, 3], datasetCategory: 'Bills', fullHistorySpanDays: 1579 },
  },
  {
    merchantKey: 'corgi homeplan ca', display: 'Corgi Homeplan CA', label: 'recurring-expense',
    rationale: 'Home-cover plan, flat £19.50, 16 charges at monthly spacing. Outside the review window but included as a labelled obligation.',
    evidence: { occurrencesInWindow: 0, occurrencesInFullHistory: 16, windowIntervalsDays: [], amountRange: [19.5, 19.5], datasetCategory: 'Insurance', fullHistorySpanDays: 460 },
  },

  // ---- income -------------------------------------------------------------
  {
    merchantKey: 'univ of nottingham', display: 'Univ OF Nottingham', label: 'income',
    rationale: 'Employer salary credit, £3748.52–3748.93, 33 deposits over 1052 days at ~30-day spacing, dataset category "Paycheck".',
    evidence: { occurrencesInWindow: 3, occurrencesInFullHistory: 33, windowIntervalsDays: [32, 30], amountRange: [3748.52, 3748.93], datasetCategory: 'Paycheck', fullHistorySpanDays: 1052 },
  },
  {
    merchantKey: 'sheila smith', display: 'Sheila Smith', label: 'income',
    rationale: 'Regular incoming transfer, £380–390, 16 credits over 441 days at ~30-day spacing, category "Supplementary Income".',
    evidence: { occurrencesInWindow: 3, occurrencesInFullHistory: 16, windowIntervalsDays: [31, 30], amountRange: [380, 390], datasetCategory: 'Supplementary Income', fullHistorySpanDays: 441 },
  },

  // ---- misleading patterns: monthly-looking but not obligations ------------
  {
    merchantKey: 'lidl ni ltd', display: 'Lidl NI LTD', label: 'neither',
    rationale: 'Exactly two grocery shops 30 days apart — the interval looks monthly, but £7.29 vs £37.09 is ordinary shopping, not a fixed bill. A deliberate trap for interval-only logic.',
    evidence: { occurrencesInWindow: 2, occurrencesInFullHistory: 2, windowIntervalsDays: [30], amountRange: [7.29, 37.09], datasetCategory: 'Groceries', fullHistorySpanDays: 30 },
  },
  {
    merchantKey: 'tesco stores', display: 'Tesco Stores', label: 'neither',
    rationale: 'Groceries at 28 and 40 day gaps. Near-monthly spacing by coincidence; amounts £2.75–£10.50 vary freely.',
    evidence: { occurrencesInWindow: 3, occurrencesInFullHistory: 34, windowIntervalsDays: [28, 40], amountRange: [2.75, 10.5], datasetCategory: 'Groceries', fullHistorySpanDays: 1352 },
  },
  {
    merchantKey: 'sainsburys s/mkts', display: 'Sainsburys S/mkts', label: 'neither',
    rationale: 'Two shops 70 days apart with near-identical amounts (£35.57/£35.80). Stable amount, but not a monthly cadence.',
    evidence: { occurrencesInWindow: 2, occurrencesInFullHistory: 22, windowIntervalsDays: [70], amountRange: [35.57, 35.8], datasetCategory: 'Groceries', fullHistorySpanDays: 1596 },
  },
  {
    merchantKey: 'dosa n chutney', display: 'Dosa N Chutney', label: 'neither',
    rationale: 'Four restaurant visits, gaps 2/19/35 days, £13.40–£41.20. Irregular discretionary spending.',
    evidence: { occurrencesInWindow: 4, occurrencesInFullHistory: 5, windowIntervalsDays: [2, 19, 35], amountRange: [13.4, 41.2], datasetCategory: 'Dine Out', fullHistorySpanDays: 104 },
  },

  // ---- clear negatives: high-volume variable spending ----------------------
  {
    merchantKey: 'save the change', display: 'Save THE Change', label: 'neither',
    rationale: 'Round-up savings sweep, 1165 transfers at near-daily spacing, £0.08–£4.52. Frequent but not a monthly obligation.',
    evidence: { occurrencesInWindow: 47, occurrencesInFullHistory: 1165, windowIntervalsDays: [1, 1, 1, 3, 3, 12], amountRange: [0.08, 4.52], datasetCategory: 'Savings', fullHistorySpanDays: 2889 },
  },
  {
    merchantKey: 'amazon', display: 'Amazon', label: 'neither',
    rationale: '815 purchases, £5.99–£229.00, bursty. Retail, not a subscription.',
    evidence: { occurrencesInWindow: 12, occurrencesInFullHistory: 815, windowIntervalsDays: [5, 19, 0, 1, 2], amountRange: [5.99, 229], datasetCategory: 'Amazon', fullHistorySpanDays: 2794 },
  },
  {
    merchantKey: 'amznmktplace', display: 'Amznmktplace', label: 'neither',
    rationale: '275 marketplace purchases at irregular gaps, £2.75–£55.58.',
    evidence: { occurrencesInWindow: 16, occurrencesInFullHistory: 275, windowIntervalsDays: [4, 1, 8, 2, 0], amountRange: [2.75, 55.58], datasetCategory: 'Amazon', fullHistorySpanDays: 1374 },
  },
  {
    merchantKey: 'uber', display: 'Uber', label: 'neither',
    rationale: '59 rides clustered irregularly, many on the same day, £1.00–£25.57.',
    evidence: { occurrencesInWindow: 26, occurrencesInFullHistory: 59, windowIntervalsDays: [3, 23, 8, 9, 0], amountRange: [1, 25.57], datasetCategory: 'Travel', fullHistorySpanDays: 1245 },
  },
  {
    merchantKey: 'lidl gb nottingha', display: 'Lidl GB Nottingha', label: 'neither',
    rationale: 'Groceries, 133 shops at irregular gaps. Also one half of a merchant-name split (see "Lidl GB Nottingham").',
    evidence: { occurrencesInWindow: 16, occurrencesInFullHistory: 133, windowIntervalsDays: [12, 1, 11, 3, 5], amountRange: [4.63, 18.21], datasetCategory: 'Groceries', fullHistorySpanDays: 999 },
  },
  {
    merchantKey: 'lidl gb nottingham', display: 'Lidl GB Nottingham', label: 'neither',
    rationale: 'The same shop under a longer truncation of the descriptor. Normalisation does not merge the two, which is a finding in itself; neither is recurring.',
    evidence: { occurrencesInWindow: 9, occurrencesInFullHistory: 74, windowIntervalsDays: [16, 12, 2, 10, 7], amountRange: [5.25, 48.3], datasetCategory: 'Groceries', fullHistorySpanDays: 995 },
  },
  {
    merchantKey: 'trading212uk', display: 'Trading212uk', label: 'neither',
    rationale: 'Investment transfers of £200–£1100 at irregular gaps. User-initiated, not a scheduled obligation.',
    evidence: { occurrencesInWindow: 8, occurrencesInFullHistory: 124, windowIntervalsDays: [15, 7, 5, 5, 21], amountRange: [200, 1100], datasetCategory: 'Investment', fullHistorySpanDays: 927 },
  },
  {
    merchantKey: 'non-gbp trans fee', display: 'Non-gbp Trans FEE', label: 'neither',
    rationale: 'Per-transaction FX fee; occurs only when a foreign purchase does. £0.06–£5.11, no cadence.',
    evidence: { occurrencesInWindow: 9, occurrencesInFullHistory: 68, windowIntervalsDays: [2, 0, 4, 0, 0], amountRange: [0.06, 5.11], datasetCategory: 'Others', fullHistorySpanDays: 1364 },
  },
  {
    merchantKey: 'miss d wu', display: 'Miss D WU', label: 'neither',
    rationale: '35 transfers at irregular gaps, £1.00–£59.00.',
    evidence: { occurrencesInWindow: 11, occurrencesInFullHistory: 35, windowIntervalsDays: [25, 0, 10, 2, 12], amountRange: [1, 59], datasetCategory: 'Services', fullHistorySpanDays: 302 },
  },
  {
    merchantKey: 'cafe terrazzo', display: 'Cafe Terrazzo', label: 'neither',
    rationale: 'Café visits, 11 over 273 days, gaps 0–19 days, £2.50–£6.00.',
    evidence: { occurrencesInWindow: 8, occurrencesInFullHistory: 11, windowIntervalsDays: [7, 1, 10, 0, 17], amountRange: [2.5, 6], datasetCategory: 'Dine Out', fullHistorySpanDays: 273 },
  },
  {
    merchantKey: 'heavenly desserts', display: 'Heavenly Desserts', label: 'neither',
    rationale: '13 visits over 182 days at irregular gaps, £4.41–£15.35.',
    evidence: { occurrencesInWindow: 7, occurrencesInFullHistory: 13, windowIntervalsDays: [21, 0, 20, 1, 21], amountRange: [4.41, 15.35], datasetCategory: 'Dine Out', fullHistorySpanDays: 182 },
  },
  {
    merchantKey: 'tesco store', display: 'Tesco Store', label: 'neither',
    rationale: '14 shops over 1424 days, gaps 0–30 days, £1.15–£31.82.',
    evidence: { occurrencesInWindow: 6, occurrencesInFullHistory: 14, windowIntervalsDays: [28, 9, 30, 17, 0], amountRange: [1.15, 31.82], datasetCategory: 'Groceries', fullHistorySpanDays: 1424 },
  },
  {
    merchantKey: "domino's pizza", display: "Domino's Pizza", label: 'neither',
    rationale: 'Five orders inside 16 days, four on the same day. Clearly not a schedule.',
    evidence: { occurrencesInWindow: 5, occurrencesInFullHistory: 5, windowIntervalsDays: [0, 0, 0, 16], amountRange: [1.64, 9.99], datasetCategory: 'Dine Out', fullHistorySpanDays: 16 },
  },
  {
    merchantKey: 'oriental mart hydr', display: 'Oriental Mart Hydr', label: 'neither',
    rationale: '72 grocery shops at irregular gaps, £16.49–£54.52.',
    evidence: { occurrencesInWindow: 4, occurrencesInFullHistory: 72, windowIntervalsDays: [23, 12, 34], amountRange: [16.49, 54.52], datasetCategory: 'Groceries', fullHistorySpanDays: 873 },
  },
  {
    merchantKey: 'derby med cafe', display: 'Derby MED Cafe', label: 'neither',
    rationale: 'Five £3.50 café visits at 2–8 day gaps. Stable amount but no monthly cadence.',
    evidence: { occurrencesInWindow: 4, occurrencesInFullHistory: 5, windowIntervalsDays: [2, 6, 8], amountRange: [3.5, 3.5], datasetCategory: 'Dine Out', fullHistorySpanDays: 192 },
  },
  {
    merchantKey: 'poundland ltd', display: 'Poundland LTD', label: 'neither',
    rationale: 'Nine shops over 1118 days, £1.50–£16.00, no cadence.',
    evidence: { occurrencesInWindow: 3, occurrencesInFullHistory: 9, windowIntervalsDays: [7, 28], amountRange: [1.5, 16], datasetCategory: 'Groceries', fullHistorySpanDays: 1118 },
  },
  {
    merchantKey: 'east mids railway', display: 'East Mids Railway', label: 'neither',
    rationale: 'Seven ticket purchases, £56.70–£213.00, travel-driven not scheduled.',
    evidence: { occurrencesInWindow: 3, occurrencesInFullHistory: 7, windowIntervalsDays: [19, 16], amountRange: [56.7, 213], datasetCategory: 'Travel', fullHistorySpanDays: 448 },
  },
  {
    merchantKey: 'iz *white rose tra', display: 'IZ *White Rose TRA', label: 'neither',
    rationale: 'Three purchases inside 41 days at 5–7 day gaps.',
    evidence: { occurrencesInWindow: 3, occurrencesInFullHistory: 4, windowIntervalsDays: [5, 7], amountRange: [10, 12.5], datasetCategory: 'Clothes', fullHistorySpanDays: 41 },
  },
  {
    merchantKey: 'aladdins bikes', display: 'Aladdins Bikes', label: 'neither',
    rationale: 'Three purchases inside one week, £6.00–£120.00. A single shopping episode.',
    evidence: { occurrencesInWindow: 3, occurrencesInFullHistory: 3, windowIntervalsDays: [4, 3], amountRange: [6, 120], datasetCategory: 'Other Shopping', fullHistorySpanDays: 7 },
  },
  {
    merchantKey: 'getyourguide uk lt', display: 'Getyourguide UK Lt', label: 'neither',
    rationale: 'Two bookings on the same day. One trip.',
    evidence: { occurrencesInWindow: 2, occurrencesInFullHistory: 3, windowIntervalsDays: [0], amountRange: [36, 43], datasetCategory: 'Travel', fullHistorySpanDays: 46 },
  },
  {
    merchantKey: 'the corinthian', display: 'The Corinthian', label: 'neither',
    rationale: 'Two charges on the same day at one venue.',
    evidence: { occurrencesInWindow: 2, occurrencesInFullHistory: 2, windowIntervalsDays: [0], amountRange: [4.6, 7.4], datasetCategory: 'Dine Out', fullHistorySpanDays: 0 },
  },

  // ---- genuinely ambiguous: excluded from scoring --------------------------
  {
    merchantKey: 'club lloyds waived', display: 'Club Lloyds Waived', label: 'ambiguous',
    rationale: 'A recurring £3.00 CREDIT that exactly reverses the Club Lloyds fee. Monthly and perfectly stable, but calling a fee waiver "income" is a judgement call, so it is not scored either way.',
    evidence: { occurrencesInWindow: 2, occurrencesInFullHistory: 50, windowIntervalsDays: [36], amountRange: [3, 3], datasetCategory: 'Supplementary Income', fullHistorySpanDays: 1579 },
  },
  {
    merchantKey: 'paulina pippen', display: 'Paulina Pippen', label: 'ambiguous',
    rationale: 'Mixed-direction transfers (£4.52 out, £325.00 in) under one name at ~26-day spacing. Could be a recurring contribution or settling up; the data does not say.',
    evidence: { occurrencesInWindow: 2, occurrencesInFullHistory: 11, windowIntervalsDays: [26], amountRange: [4.52, 325], datasetCategory: 'Supplementary Income', fullHistorySpanDays: 284 },
  },
  {
    merchantKey: 'blend coffee house', display: 'Blend Coffee House', label: 'ambiguous',
    rationale: 'Mixed-direction entries at a café, categorised "Supplementary Income" by the dataset. Likely a refund; too unclear to label.',
    evidence: { occurrencesInWindow: 2, occurrencesInFullHistory: 3, windowIntervalsDays: [0], amountRange: [3.25, 18.45], datasetCategory: 'Supplementary Income', fullHistorySpanDays: 203 },
  },
  {
    merchantKey: 'pie minister', display: 'PIE Minister', label: 'ambiguous',
    rationale: 'Mixed-direction entries over 18 days; probably a purchase plus refund, not a pattern.',
    evidence: { occurrencesInWindow: 3, occurrencesInFullHistory: 3, windowIntervalsDays: [18, 0], amountRange: [8.17, 41.2], datasetCategory: 'Dine Out', fullHistorySpanDays: 18 },
  },
]
