/**
 * Deterministic merchant normalisation.
 *
 * Bank descriptors are noisy: `SPOTIFY USA 877-778-1161` and `SPOTIFY USA` are
 * the same subscription, but a naive grouping treats them as two merchants and
 * finds no recurrence. This layer cleans the descriptor down to a stable key.
 *
 * It is intentionally simple: cleanup rules plus a small explicit alias map.
 * There is no fuzzy matching, no edit-distance scoring and no learning, because
 * every grouping decision must be explainable to the user in one sentence.
 */

/**
 * Explicit aliases. The key is a substring searched for in the cleaned,
 * lowercased descriptor; the value is the name shown to the user.
 *
 * Entries are matched longest-key-first, so `uber eats` wins over `uber`
 * regardless of the order they are written here.
 */
const MERCHANT_ALIASES: Record<string, string> = {
  spotify: 'Spotify',
  netflix: 'Netflix',
  hulu: 'Hulu',
  'hbo max': 'HBO Max',
  xfinity: 'Xfinity Internet',
  comcast: 'Xfinity Internet',
  'chase card payment': 'Chase Credit Card',
  'chase credit crd': 'Chase Credit Card',
  'planet fitness': 'Planet Fitness',
  'trader joe': "Trader Joe's",
  'whole foods': 'Whole Foods',
  safeway: 'Safeway',
  kroger: 'Kroger',
  starbucks: 'Starbucks',
  doordash: 'DoorDash',
  'uber eats': 'Uber Eats',
  ubereats: 'Uber Eats',
  uber: 'Uber',
  lyft: 'Lyft',
  venmo: 'Venmo',
  'cash app': 'Cash App',
  amazon: 'Amazon',
  'apple.com': 'Apple',
  'ach deposit': 'Direct Deposit',
}

const ALIAS_ENTRIES = Object.entries(MERCHANT_ALIASES).sort(
  (a, b) => b[0].length - a[0].length,
)

/** Payment-network noise that carries no information about who was paid. */
const PREFIX_NOISE = [
  'pos debit',
  'pos purchase',
  'debit card purchase',
  'recurring payment',
  'checkcard',
  'sq *',
  'sq*',
  'tst*',
  'pp*',
  'paypal *',
]

/** Result of normalising one merchant descriptor. */
export interface NormalizedMerchant {
  /** Display name, e.g. `Spotify`. */
  display: string
  /** Lowercased grouping key, e.g. `spotify`. */
  key: string
}

/**
 * Remove transaction identifiers, phone numbers and store numbers.
 *
 * Only digit groups that cannot plausibly be part of a brand name are removed:
 * a standalone run of 4 or more digits, or a run of any length introduced by
 * `#` or `*`. `7-Eleven` and `Studio 54` survive untouched.
 */
function stripTransactionNoise(value: string): string {
  return (
    value
      // phone numbers: 877-778-1161, 877.778.1161, (877) 778-1161
      .replace(/\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}/g, ' ')
      // card/store suffixes: #4421, *4421, xx4421, x4421
      .replace(/[#*]\s*\d+/g, ' ')
      .replace(/\bx{2,}\d+\b/gi, ' ')
      // long standalone identifiers: 4 or more digits on their own
      .replace(/\b\d{4,}\b/g, ' ')
      // web suffixes
      .replace(/\.(com|net|org|co)\b/gi, ' ')
  )
}

/**
 * Run the full cleanup pipeline on a descriptor, preserving its original
 * casing. Both the grouping key and the display name come from this same
 * function so they can never disagree about what was removed.
 */
function clean(collapsed: string): string {
  const lowered = collapsed.toLowerCase()

  let working = collapsed
  for (const prefix of PREFIX_NOISE) {
    if (lowered.startsWith(prefix)) {
      working = collapsed.slice(prefix.length)
      break
    }
  }

  return stripTransactionNoise(working)
    .replace(/[,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // leftover separators at either end, e.g. "netflix -"
    .replace(/^[-\u2013\u2014/\\.*#]+|[-\u2013\u2014/\\.*#]+$/g, '')
    .trim()
}

/** Title-case a cleaned descriptor, preserving short all-caps tokens like `REI`. */
function toTitleCase(cleaned: string): string {
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((token) => {
      if (token.length <= 3 && /^[A-Z]+$/.test(token)) return token
      // Capitalise the first LETTER, not the first character, so `7-eleven`
      // becomes `7-Eleven` rather than staying lowercase.
      return token
        .toLowerCase()
        .replace(/[a-z]/, (letter) => letter.toUpperCase())
    })
    .join(' ')
}

/**
 * Normalise a raw merchant descriptor into a display name and grouping key.
 *
 * Steps, in order:
 *   1. trim and collapse runs of whitespace
 *   2. drop payment-network prefixes (`POS DEBIT`, `SQ *`, …)
 *   3. strip transaction identifiers, store numbers and phone numbers
 *   4. look for an explicit alias (longest match wins)
 *   5. otherwise title-case what remains
 */
export function normalizeMerchant(raw: string): NormalizedMerchant {
  const collapsed = (raw ?? '').replace(/\s+/g, ' ').trim()
  const cleaned = clean(collapsed)
  const lowered = cleaned.toLowerCase()

  for (const [pattern, display] of ALIAS_ENTRIES) {
    if (lowered.includes(pattern)) {
      return { display, key: display.toLowerCase() }
    }
  }

  if (cleaned.length === 0) {
    // The descriptor was nothing but identifiers. Keep the original so the user
    // can still recognise the row rather than showing them an empty cell.
    const fallback = collapsed.length > 0 ? collapsed : 'Unknown merchant'
    return { display: fallback, key: fallback.toLowerCase() }
  }

  const display = toTitleCase(cleaned)
  return { display, key: display.toLowerCase() }
}

/** Attach normalisation to a list of transactions. */
export function normalizeTransactions<T extends { merchant: string }>(
  transactions: T[],
): (T & { normalizedMerchant: string; merchantKey: string })[] {
  return transactions.map((transaction) => {
    const { display, key } = normalizeMerchant(transaction.merchant)
    return { ...transaction, normalizedMerchant: display, merchantKey: key }
  })
}
