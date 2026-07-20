import { normalizeDescription, tokenize, containsTokenRun } from "./normalize";
import { ALIAS_INDEX } from "./merchants";
import type { CATEGORIES, TxnType } from "../types";

type Category = (typeof CATEGORIES)[number];

/** Where a category came from — drives what the review screen tells the user. */
export type MatchSource = "correction" | "merchant" | "income-heuristic" | "none";

export interface CategoryMatch {
  category: Category;
  type: TxnType;
  /** 0–1. Anything below REVIEW_THRESHOLD is surfaced for confirmation. */
  confidence: number;
  source: MatchSource;
  /** Canonical merchant name when source is "merchant", for UI explanation. */
  merchant?: string;
  /** Stable key this description learns under. */
  normalized: string;
}

export const REVIEW_THRESHOLD = 0.9;

const CONFIDENCE: Record<MatchSource, number> = {
  correction: 1,
  merchant: 0.9,
  "income-heuristic": 0.6,
  none: 0,
};

/**
 * Money moving between the account holder's own accounts.
 *
 * Standard Bank marks these "IB TRANSFER TO" / "IB TRANSFER FROM" (IB being
 * internet banking). The TRANSFER/PAYMENT split is the load-bearing part:
 *
 *   IB TRANSFER TO   -> your own other account   (movement, not spending)
 *   IB PAYMENT TO    -> someone else             (a real expense)
 *
 * So "PAYMENT" is deliberately excluded below — treating it as movement
 * would erase genuine spending from every total.
 *
 * Only the Standard Bank wording is confirmed against a real statement. The
 * other patterns are best-effort for FNB/Capitec/Absa/Nedbank; when one is
 * wrong the user recategorises it once and the correction is remembered.
 */
const INTERNAL_TRANSFER_RE = new RegExp(
  [
    // Standard Bank — verified
    String.raw`\bIB\s+TRANSFER\b`,
    // Common across banks
    String.raw`\bINTERNAL\s+TR(AN)?SF?E?R\b`,
    String.raw`\bTRANSFER\s+(TO|FROM)\s+(MY|OWN|SAVINGS|CHEQUE|CURRENT)\b`,
    String.raw`\bINTER[\s-]?ACCOUNT\b`,
    // FNB / Capitec shorthand
    String.raw`\bINT\s?TRF\b`,
    String.raw`\bTRF\s+(TO|FROM)\b`,
  ].join("|"),
  "i",
);

/** Categories that only ever make sense as income. */
const INCOME_CATEGORIES = new Set<Category>(["Salary", "Freelance"]);

/** Descriptions that read as money coming in, when the sign is ambiguous. */
const INCOME_HINTS = ["DEPOSIT", "CREDIT", "REFUND", "REVERSAL", "INTEREST"];

/**
 * User corrections, keyed by normalised description.
 *
 * Lives behind these two functions so the Supabase migration only has to
 * change the implementation, not every caller. Corrections are the most
 * valuable signal we have: people shop at the same twenty places, so after
 * a few weeks a user's own map beats any general model on their data — and
 * it doubles as the labelled dataset for a classifier later.
 */
export type CorrectionMap = Record<string, Category>;

export function applyCorrection(
  corrections: CorrectionMap,
  description: string,
  category: Category,
): CorrectionMap {
  const key = normalizeDescription(description);
  if (!key) return corrections;
  return { ...corrections, [key]: category };
}

/**
 * Look up a merchant by normalised token run. Longest alias wins.
 *
 * Falls back to prefix matching on the final token because statements clip
 * descriptions to a fixed width — a real one rendered "CHICKEN LICKEN" as
 * "CHICKEN LICKE", which an exact match misses entirely. Only applied to
 * reasonably long fragments, so short tokens can't match half the dictionary.
 */
function matchMerchant(tokens: string[]) {
  for (const entry of ALIAS_INDEX) {
    if (containsTokenRun(tokens, entry.tokens)) return entry;
  }

  for (const entry of ALIAS_INDEX) {
    const last = entry.tokens[entry.tokens.length - 1];
    if (last.length < 5) continue;

    const head = entry.tokens.slice(0, -1);
    for (let i = 0; i <= tokens.length - entry.tokens.length; i++) {
      const headMatches =
        head.length === 0 ||
        head.every((t, j) => tokens[i + j] === t);
      if (!headMatches) continue;

      const candidate = tokens[i + head.length];
      // Truncated, not merely similar: at least 4 chars and a real prefix.
      if (candidate && candidate.length >= 4 && last.startsWith(candidate)) {
        return entry;
      }
    }
  }

  return null;
}

function inferType(amount: number, normalized: string, category: Category | null): TxnType {
  if (category && INCOME_CATEGORIES.has(category)) return "income";
  if (amount !== 0) return amount < 0 ? "expense" : "income";
  // Zero or unsigned amount — fall back to wording.
  return INCOME_HINTS.some((h) => normalized.includes(h)) ? "income" : "expense";
}

/**
 * Categorise a single transaction description.
 *
 * Cascade, highest precision first:
 *   1. what this user already corrected for the same merchant
 *   2. the SA merchant dictionary
 *   3. income wording, when the amount sign leaves it ambiguous
 *   4. give up — "Other", flagged for review rather than silently assigned
 */
export function categorizeOne(
  description: string,
  amount: number,
  corrections: CorrectionMap = {},
): CategoryMatch {
  const normalized = normalizeDescription(description);
  const tokens = tokenize(normalized);

  const corrected = corrections[normalized];
  if (corrected) {
    return {
      category: corrected,
      type: inferType(amount, normalized, corrected),
      confidence: CONFIDENCE.correction,
      source: "correction",
      normalized,
    };
  }

  // Transfers are detected on the raw description, before normalisation.
  // "IB TRANSFER TO" is stripped as a channel prefix (correctly — it lets
  // "IB PAYMENT TO WOOLWORTHS" match Woolworths), which erased the very
  // signal that marks an inter-account move. On a real statement that made
  // outgoing transfers count as spending while incoming ones were excluded.
  if (INTERNAL_TRANSFER_RE.test(description)) {
    return {
      category: "Transfers",
      type: amount < 0 ? "expense" : "income",
      confidence: CONFIDENCE.merchant,
      source: "merchant",
      merchant: "Transfer between accounts",
      normalized,
    };
  }

  // A standalone "FEE"/"FEES" token means the bank's charge for a transaction,
  // not the transaction. "FEE: PREPAID MOBILE PURCHASE" is a R1 charge
  // alongside the airtime — matching it on "PREPAID MOBILE" would file the fee
  // as airtime and double-count the spend.
  //
  // The token is not always first. Standard Bank prints the charge type ahead
  // of the word: "CASH DEPOSIT FEE - AUTOBANK", "CASH WITHDRAWAL FEE",
  // "MONTHLY MANAGEMENT FEE". Checking only tokens[0] let "CASH DEPOSIT FEE"
  // fall through to the "CASH DEPOSIT" deposit rule and be booked as money IN —
  // a fee counted as income. So scan the whole line for the token. It is a
  // real word ("COFFEE" tokenises to COFFEE, not FEE), so this stays precise.
  if (tokens.includes("FEE") || tokens.includes("FEES")) {
    return {
      category: "Bank fees",
      type: "expense",
      confidence: CONFIDENCE.merchant,
      source: "merchant",
      merchant: "Bank fee",
      normalized,
    };
  }

  const merchant = matchMerchant(tokens);
  if (merchant) {
    return {
      category: merchant.category,
      type: inferType(amount, normalized, merchant.category),
      confidence: CONFIDENCE.merchant,
      source: "merchant",
      merchant: merchant.merchant,
      normalized,
    };
  }

  if (amount > 0 && INCOME_HINTS.some((h) => normalized.includes(h))) {
    return {
      category: "Other",
      type: "income",
      confidence: CONFIDENCE["income-heuristic"],
      source: "income-heuristic",
      normalized,
    };
  }

  return {
    category: "Other",
    type: inferType(amount, normalized, null),
    confidence: CONFIDENCE.none,
    source: "none",
    normalized,
  };
}

/**
 * A human-friendly label for a raw bank description.
 *
 * "CARD PURCHASE AT SUPERBALIST ONLINE 4471" reads as "Superbalist" once the
 * merchant is recognised; otherwise the description is stripped of transport
 * noise and title-cased, which still beats showing the raw line.
 */
export function displayName(description: string): string {
  const normalized = normalizeDescription(description);
  const tokens = tokenize(normalized);

  const merchant = matchMerchant(tokens);
  if (merchant) return merchant.merchant;

  if (!normalized) return description.trim();

  return normalized
    .toLowerCase()
    .split(" ")
    .slice(0, 4)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()))
    .join(" ");
}

export interface CategorizedRow {
  date: string;
  description: string;
  amount: number;
  category: Category;
  type: TxnType;
  confidence: number;
  source: MatchSource;
  merchant?: string;
  normalized: string;
}

export interface CategorizeSummary {
  rows: CategorizedRow[];
  /** Rows the user should eyeball before importing. */
  needsReview: number;
  /** Share of rows resolved confidently — the number to watch as rules improve. */
  coverage: number;
}

export function categorizeAll(
  transactions: Array<{ date: string; description: string; amount: number }>,
  corrections: CorrectionMap = {},
): CategorizeSummary {
  const rows = transactions.map((t) => {
    const match = categorizeOne(t.description, t.amount, corrections);
    return {
      date: t.date,
      description: t.description,
      amount: Math.abs(t.amount),
      category: match.category,
      type: match.type,
      confidence: match.confidence,
      source: match.source,
      merchant: match.merchant,
      normalized: match.normalized,
    };
  });

  const needsReview = rows.filter((r) => r.confidence < REVIEW_THRESHOLD).length;

  return {
    rows,
    needsReview,
    coverage: rows.length === 0 ? 0 : (rows.length - needsReview) / rows.length,
  };
}
