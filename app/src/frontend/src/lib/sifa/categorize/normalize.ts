/**
 * Bank statement descriptions arrive wrapped in transport noise:
 *
 *   "POS PURCHASE WOOLWORTHS 1234 SANDTON CITY 12/03"
 *   "FNB APP PAYMENT TO CHECKERS HYPER *4471"
 *   "DEBIT ORDER DSTV PREMIUM 08052341"
 *
 * Matching merchants against the raw string is unreliable — the same shop
 * produces a different string on every line. Normalising first strips the
 * noise and leaves a stable token stream to match against, which is also
 * the key we store user corrections under.
 */

/** Transaction-channel prefixes SA banks prepend. Order matters: longer first. */
const CHANNEL_NOISE = [
  "INTERNET BANKING PAYMENT TO",
  "INTERNET BANKING TRANSFER TO",
  "INTERNET BANKING PAYMENT FROM",
  "FNB APP PAYMENT TO",
  "FNB APP TRANSFER TO",
  "CAPITEC APP PAYMENT",
  "IMMEDIATE PAYMENT",
  "MAGTAPE CREDIT",
  "MAGTAPE DEBIT",
  "EXTERNAL DEBIT ORDER",
  "UNPAID DEBIT ORDER",
  "DEBIT ORDER",
  "CARD PURCHASE AT",
  "POS PURCHASE AT",
  "CARD PURCHASE",
  "POS PURCHASE",
  "PURCHASE AT",
  "ATM WITHDRAWAL AT",
  "ATM WITHDRAWAL",
  "CASH WITHDRAWAL",
  "ATM CASH DEP",
  "INTERNET BANKING",
  "IB PAYMENT TO",
  "IB TRANSFER TO",
  "PAYMENT TO",
  "PAYMENT FROM",
  "TRANSFER TO",
  "TRANSFER FROM",
  "PAYMENT RECEIVED",
  "PURCHASE",
  "EFT TO",
  "EFT FROM",
  "EFT",
  "TFR",
];

/** Card / account fragments: *4471, XXXX4471, ****4471 */
const CARD_FRAGMENT = /[*x]{2,}\s?\d{2,6}|\*\d{2,6}/gi;

/** Dates in any shape a statement might carry: 12/03, 2023-10-15, 15 OCT 23 */
const DATE_FRAGMENT =
  /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b|\b\d{1,2}\s?(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s?\d{0,4}\b/gi;

/** Standalone digit runs — store numbers, reference numbers, terminal IDs. */
const NUMERIC_TOKEN = /\b\d{2,}\b/g;

/**
 * Reduce a raw bank description to a stable, matchable form.
 * Returns an uppercase string of space-separated alphabetic tokens.
 */
export function normalizeDescription(raw: string): string {
  if (!raw) return "";

  // Uppercase and strip accents so "Café" and "CAFE" collapse together.
  let s = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();

  s = s.replace(CARD_FRAGMENT, " ");
  s = s.replace(DATE_FRAGMENT, " ");

  // Strip channel prefixes repeatedly — some banks stack two ("EFT PAYMENT TO").
  let changed = true;
  while (changed) {
    changed = false;
    const trimmed = s.trim();
    for (const prefix of CHANNEL_NOISE) {
      if (trimmed.startsWith(prefix + " ") || trimmed === prefix) {
        s = trimmed.slice(prefix.length);
        changed = true;
        break;
      }
    }
  }

  s = s.replace(NUMERIC_TOKEN, " ");
  // Keep & — it distinguishes "MUGG & BEAN". Everything else becomes a space.
  s = s.replace(/[^A-Z&\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

/** Tokenised form of a normalised description, for token-sequence matching. */
export function tokenize(normalized: string): string[] {
  return normalized ? normalized.split(" ").filter(Boolean) : [];
}

/**
 * Does `tokens` contain `pattern` as a consecutive token run?
 *
 * Token-level rather than substring matching, so "GAME" doesn't fire on
 * "GAMEPLAY" and "MTN" doesn't fire inside an unrelated reference string.
 */
export function containsTokenRun(tokens: string[], pattern: string[]): boolean {
  if (pattern.length === 0 || pattern.length > tokens.length) return false;
  for (let i = 0; i <= tokens.length - pattern.length; i++) {
    let hit = true;
    for (let j = 0; j < pattern.length; j++) {
      if (tokens[i + j] !== pattern[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}
