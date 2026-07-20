import Papa from "papaparse";

/**
 * Statement parsing, entirely in the browser.
 *
 * The file never leaves the device. That is the privacy story, but it is also
 * the accuracy story: pdf.js hands us every text item with x/y coordinates,
 * and a bank statement is a table, so we can reconstruct rows from geometry
 * rather than asking a language model to guess a table back out of flattened
 * text.
 */

export interface ParsedRow {
  date: string; // ISO yyyy-mm-dd
  description: string;
  amount: number; // signed: negative = money out
  /**
   * A bank fee printed on the same PDF line as this transaction rather than
   * getting its own row — Capitec does this for ATM withdrawals, immediate
   * payments and external payments. CSV fees always already arrive as their
   * own row, so this is PDF-only. parsePdf splits it into a second ParsedRow
   * of its own: leaving it attached here would silently drop it from every
   * total, since only `amount` is ever summed.
   */
  bundledFee?: number;
}

export interface ParseResult {
  rows: ParsedRow[];
  /** Lines that looked like transactions but couldn't be read. */
  skipped: number;
  /**
   * Opening and closing balances read off the statement, when present.
   *
   * These let the import prove itself: opening + sum(transactions) must equal
   * closing. On a real statement this caught a reference number being parsed
   * as part of an amount, which had inflated income by R531 000 while every
   * row still looked plausible on screen.
   */
  reconciliation: {
    opening: number;
    closing: number;
    net: number;
    /** Whether opening + net lands on closing, within a cent of rounding. */
    matches: boolean;
    difference: number;
  } | null;
  source: "csv" | "pdf";
  warning?: string;
}

// ── Date handling ────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

/**
 * Parse the date formats SA statements actually use.
 *
 * Day-first is assumed for ambiguous slash dates (05/03/2024 is 5 March), which
 * is the SA convention — getting this backwards silently scrambles a whole
 * statement, so it is not left to chance.
 */
export function parseDate(raw: string, fallbackYear?: number): string | null {
  const s = raw.trim().toUpperCase();
  if (!s) return null;

  // 2024-03-05 — already ISO
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // 2024/03/01, 2024.03.01 — year first. Capitec and Nedbank CSV exports use
  // this; a leading 4-digit group is unambiguous, so it's checked before the
  // day-first pattern below rather than guessed at. Without this branch a
  // year-first CSV fails to parse a single row and imports as 0 transactions.
  const yearFirst = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (yearFirst) {
    const year = Number(yearFirst[1]);
    const month = Number(yearFirst[2]);
    const day = Number(yearFirst[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // 05/03/2024, 05-03-24, 05.03.2024 — day first
  const slash = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    let year = Number(slash[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // 05 MAR 2024 / 05 MAR / MAR 05
  const dmy = s.match(/^(\d{1,2})\s*([A-Z]{3})[A-Z]*\.?\s*(\d{2,4})?$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = MONTHS[dmy[2]];
    if (!month) return null;
    let year = dmy[3] ? Number(dmy[3]) : (fallbackYear ?? new Date().getFullYear());
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const mdy = s.match(/^([A-Z]{3})[A-Z]*\.?\s*(\d{1,2}),?\s*(\d{2,4})?$/);
  if (mdy) {
    const month = MONTHS[mdy[1]];
    const day = Number(mdy[2]);
    if (!month) return null;
    let year = mdy[3] ? Number(mdy[3]) : (fallbackYear ?? new Date().getFullYear());
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

// ── Amount handling ──────────────────────────────────────────

/**
 * Parse an amount, handling the notations statements use for money out:
 * trailing "-" (1 234.56-), "Dr"/"Cr" suffixes, and bracketed negatives.
 * Also copes with both "1 234,56" and "1,234.56" thousand/decimal styles.
 */
export function parseAmount(raw: string): number | null {
  // Strip whitespace only. The currency "R" is dropped further down —
  // removing it globally here would also eat the R in a "DR"/"CR" suffix.
  let s = raw.trim().toUpperCase().replace(/\s/g, "");
  if (!s) return null;

  let negative = false;

  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }

  // Debit/credit markers, handled before the currency symbol goes.
  if (s.endsWith("DR")) {
    negative = true;
    s = s.slice(0, -2);
  } else if (s.endsWith("CR")) {
    s = s.slice(0, -2);
  }

  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/^R/, "");

  // Decide which separator is the decimal point by looking at the last one.
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }

  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/**
 * Money on a statement line.
 *
 * Two constraints, both learned from a real Standard Bank statement where a
 * reference number ran straight into the amount:
 *
 *   17 Jun 26 HATFIELD P4 16H58 338279531 600.00 588.66
 *
 * Because space doubles as a thousands separator, "…531 600.00" reads as
 * R531 600 rather than R600 — turning a R600 purchase into six figures.
 *
 *  - The lookbehind stops a match beginning part-way through a longer number,
 *    so the tail of a reference can't become the leading digits of an amount.
 *  - Decimals are mandatory. Statement amounts always print them; reference
 *    numbers, card fragments and timestamps don't, so this excludes them
 *    outright. Missing a row is recoverable — the review screen shows totals
 *    to check — whereas inventing R531 600 silently corrupts every figure.
 *
 * The integer part is either grouped ("25 400.00", "1,234.56") or an ungrouped
 * run ("6250.00"). Requiring a group separator — as this did — made every
 * amount over R999.99 invisible on the many statements that print no
 * separator, so those rows were dropped whole and the totals came up short.
 * The lookbehind, not the grouping, is what keeps a reference tail out.
 */
const AMOUNT_RE =
  /(?<![\d.,])\(?-?R?\s?(?:\d{1,3}(?:[\s,]\d{3})+|\d+)[.,]\d{2}-?\)?(?:\s?(?:DR|CR))?/gi;
const DATE_RE =
  /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{1,2}\s?[A-Za-z]{3,9}\.?\s?\d{0,4})\b/;

/**
 * Rows that are statement furniture rather than transactions.
 *
 * Matched as substrings, so anything here must be a phrase that can never
 * appear inside a real transaction description.
 */
const NOISE = [
  "OPENING BALANCE", "CLOSING BALANCE", "BALANCE BROUGHT", "BALANCE CARRIED",
  "BROUGHT FORWARD", "CARRIED FORWARD", "STATEMENT PERIOD", "AVAILABLE BALANCE",
  "TOTAL CREDITS", "TOTAL DEBITS", "PAGE ", "VAT REG", "ACCOUNT NUMBER",
  "ACCOUNT HOLDER", "STATEMENT NO", "CONTACT US", "CUSTOMER CARE",
  // Page furniture repeated on every sheet — these carry a date and were
  // being counted as transactions we failed to read, which produced an
  // alarming "17 lines couldn't be read" on a statement that parsed fine.
  "MONTH STATEMENT", "TRANSACTION DETAILS", "STATEMENT DATE", "PLEASE NOTE",
  "TERMS AND CONDITIONS",
];

/**
 * Phrases that head a footer paragraph but are also things a bank genuinely
 * charges you for. "BANK CHARGES" and "INTEREST" are line items on almost
 * every SA statement, and "CONTACT" is a substring of "CONTACTLESS" — matching
 * them unconditionally deleted real debits and quietly understated spending.
 *
 * Footer prose carries no date, so a date is what separates the two.
 */
const AMBIGUOUS_NOISE = ["BANK CHARGES", "INTEREST RATE", "SERVICE FEE"];

/** "From: 17 Apr 26", "To: 16 Jul 26" — statement range headers, not rows. */
const RANGE_HEADER_RE = /^\s*(from|to)\s*:/i;

/** A bare date on its own line (the statement's print date). */
const BARE_DATE_RE =
  /^\s*\d{1,2}\s?[A-Za-z]{3,9}\.?\s?\d{2,4}\s*$|^\s*\d{4}-\d{2}-\d{2}\s*$/;

function isNoise(line: string): boolean {
  const u = line.toUpperCase();
  if (NOISE.some((n) => u.includes(n))) return true;
  if (RANGE_HEADER_RE.test(line)) return true;
  if (BARE_DATE_RE.test(line)) return true;
  // Undated footer prose only — a dated one is the charge itself.
  if (AMBIGUOUS_NOISE.some((n) => u.includes(n)) && !DATE_RE.test(line)) return true;
  return false;
}

// ── Reconciliation ───────────────────────────────────────────

const OPENING_RE = /(?:statement\s+)?opening balance|balance brought forward|balance b\/f/i;
// A statement's closing balance is what transactions should reconcile
// against. Available balance is a different figure — it reflects pending
// holds — that can differ from closing by design, not by parsing error. A
// real Capitec statement prints both a line apart ("Closing Balance:
// R360.71", "Available Balance: R330.71"); matching them interchangeably
// picked whichever happened to appear last rather than the authoritative
// one. True closing wording is preferred; available balance is kept only as
// the fallback for statements (Standard Bank) that never print an explicit
// closing figure at all.
const TRUE_CLOSING_RE = /(?:statement\s+)?closing balance|balance carried forward|balance c\/f/i;
const AVAILABLE_BALANCE_RE = /available balance/i;

/** Last money-shaped token on a line — balances are printed at the right. */
function trailingAmount(line: string): number | null {
  const matches = line.match(new RegExp(AMOUNT_RE.source, "gi"));
  if (!matches || matches.length === 0) return null;
  return parseAmount(matches[matches.length - 1]);
}

/**
 * Read the statement's own opening and closing balances so the import can
 * check its arithmetic against the bank's. Silent when either is absent —
 * an unverifiable import is fine, a wrong one is not.
 */
export function detectReconciliation(
  lines: string[],
  rows: ParsedRow[],
): ParseResult["reconciliation"] {
  let opening: number | null = null;
  let closing: number | null = null;
  let availableFallback: number | null = null;

  for (const line of lines) {
    if (opening === null && OPENING_RE.test(line)) {
      const v = trailingAmount(line);
      if (v !== null) opening = v;
    }
    if (TRUE_CLOSING_RE.test(line)) {
      const v = trailingAmount(line);
      // Take the last closing-shaped figure; statements repeat it per page.
      if (v !== null) closing = v;
    } else if (AVAILABLE_BALANCE_RE.test(line)) {
      const v = trailingAmount(line);
      if (v !== null) availableFallback = v;
    }
  }

  if (closing === null) closing = availableFallback;
  if (opening === null || closing === null) return null;

  const net = rows.reduce((s, r) => s + r.amount, 0);
  const difference = Math.round((opening + net - closing) * 100) / 100;

  return {
    opening,
    closing,
    net: Math.round(net * 100) / 100,
    matches: Math.abs(difference) < 0.02,
    difference,
  };
}

// ── CSV ──────────────────────────────────────────────────────

const DATE_HEADERS = ["date", "transaction date", "posting date", "txn date", "value date"];
const DESC_HEADERS = ["description", "narrative", "details", "reference", "transaction", "memo", "payee"];
const AMOUNT_HEADERS = ["amount", "value", "transaction amount"];
const DEBIT_HEADERS = ["debit", "money out", "withdrawal", "paid out"];
const CREDIT_HEADERS = ["credit", "money in", "deposit", "paid in"];
// Capitec's CSV export prints bank charges in their own "Fee" column, entirely
// separate from Money In/Money Out — a fee-only row ("ATM Cash Withdrawal
// Fee", "Monthly Account Admin Fee") has both of those blank. Without reading
// this column every such row fails the amount check and is silently dropped:
// on a real 7-month Capitec statement that was 66 of 299 rows — every bank
// fee on the account, a fifth of the whole statement, gone with no warning.
const FEE_HEADERS = ["fee", "fees"];

const findCol = (headers: string[], candidates: string[]) =>
  headers.findIndex((h) => candidates.some((c) => h === c)) >= 0
    ? headers.findIndex((h) => candidates.some((c) => h === c))
    : headers.findIndex((h) => candidates.some((c) => h.includes(c)));

export function parseCsv(text: string): ParseResult {
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    // Papa handles quoted fields containing commas, which naive splitting does
    // not — bank descriptions are full of them.
  });

  const rows = parsed.data.filter((r) => Array.isArray(r) && r.length > 0);
  if (rows.length === 0) {
    return { rows: [], skipped: 0, reconciliation: null, source: "csv", warning: "The file was empty." };
  }

  // The real header row isn't always row 0. FNB (and others) export a few
  // metadata lines first — "Account Number,...", "Statement Period,...",
  // "Opening Balance,..." — before the actual "Date,Amount,Balance,..." row.
  // Assuming row 0 is the header made those preamble rows the column map:
  // dateCol/descCol/amountCol landed on whatever row 0 happened to be, and
  // the real header row got parsed as a data row with the running BALANCE
  // read as the transaction amount — worse than dropping rows, since it
  // silently imports the wrong figure. Scan a bounded window instead.
  const HEADER_SCAN_LIMIT = 10;
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, HEADER_SCAN_LIMIT); i++) {
    const candidate = rows[i].map((h) => String(h ?? "").trim().toLowerCase());
    if (
      findCol(candidate, DATE_HEADERS) >= 0 ||
      findCol(candidate, AMOUNT_HEADERS) >= 0 ||
      findCol(candidate, DEBIT_HEADERS) >= 0
    ) {
      headerRowIndex = i;
      break;
    }
  }

  const hasHeader = headerRowIndex >= 0;
  const headers = hasHeader
    ? rows[headerRowIndex].map((h) => String(h ?? "").trim().toLowerCase())
    : [];

  let dateCol = 0;
  let descCol = 1;
  let amountCol = 2;
  let debitCol = -1;
  let creditCol = -1;
  let feeCol = -1;

  if (hasHeader) {
    dateCol = Math.max(0, findCol(headers, DATE_HEADERS));
    // Math.max(0, -1) would silently fall back to column 0 — the date column
    // — if the description header isn't in DESC_HEADERS (e.g. "Particulars").
    // Only override the positional default when a real match is found.
    const foundDesc = findCol(headers, DESC_HEADERS);
    descCol = foundDesc >= 0 ? foundDesc : 1;
    amountCol = findCol(headers, AMOUNT_HEADERS);
    debitCol = findCol(headers, DEBIT_HEADERS);
    creditCol = findCol(headers, CREDIT_HEADERS);
    feeCol = findCol(headers, FEE_HEADERS);
  }

  const out: ParsedRow[] = [];
  let skipped = 0;

  for (let i = hasHeader ? headerRowIndex + 1 : 0; i < rows.length; i++) {
    const cols = rows[i].map((c) => String(c ?? "").trim());
    if (cols.length < 2) continue;
    const joined = cols.join(" ");
    if (isNoise(joined)) continue;

    const date = parseDate(cols[dateCol] ?? "");
    if (!date) {
      if (joined.trim()) skipped++;
      continue;
    }

    let amount: number | null = null;
    if (debitCol >= 0 || creditCol >= 0 || feeCol >= 0) {
      // Separate debit/credit/fee columns: whichever is populated wins. Fees
      // are checked last — every sample seen has a fee on its own row with
      // debit/credit blank, never alongside a real debit on the same line —
      // and a fee is always money out.
      const debit = debitCol >= 0 ? parseAmount(cols[debitCol] ?? "") : null;
      const credit = creditCol >= 0 ? parseAmount(cols[creditCol] ?? "") : null;
      const fee = feeCol >= 0 ? parseAmount(cols[feeCol] ?? "") : null;
      if (debit) amount = -Math.abs(debit);
      else if (credit) amount = Math.abs(credit);
      else if (fee) amount = -Math.abs(fee);
    } else if (amountCol >= 0) {
      amount = parseAmount(cols[amountCol] ?? "");
    }

    if (amount === null || amount === 0) {
      skipped++;
      continue;
    }

    const description = (cols[descCol] ?? "").trim() || "Unknown";
    out.push({ date, description, amount });
  }

  return { rows: out, skipped, reconciliation: null, source: "csv" };
}

// ── PDF ──────────────────────────────────────────────────────

export interface TextItem {
  str: string;
  x: number;
  y: number;
}

/**
 * Group text items into visual rows by y-position, then order each by x.
 *
 * Grouping is by adjacency, not by snapping y to fixed bands. Banding
 * (`Math.round(y / tolerance)`) puts two spans of the same printed line into
 * different groups whenever they straddle a band edge — y=700.4 and y=701.9
 * are 1.5pt apart but round to 233 and 234. pdf.js reports baselines that
 * differ by a fraction of a point within one row as a matter of course, so
 * this split real rows in half: the fragment holding the date had no amount
 * and the fragment holding the amounts had no date, so neither parsed and
 * neither tripped the "couldn't be read" warning. The transaction just
 * disappeared, which is exactly the failure the totals were coming up short by.
 */
export function itemsToLines(items: TextItem[], tolerance = 3): string[] {
  const sorted = items
    .filter((i) => i.str.trim())
    // pdf y grows upward, so descending = top-down.
    .sort((a, b) => b.y - a.y);

  const rows: TextItem[][] = [];
  let current: TextItem[] = [];
  let anchor = 0;

  for (const item of sorted) {
    // Compare against the row's anchor rather than the previous item, so a run
    // of slightly-drifting baselines can't creep a row arbitrarily far.
    if (current.length === 0 || Math.abs(item.y - anchor) <= tolerance) {
      if (current.length === 0) anchor = item.y;
      current.push(item);
    } else {
      rows.push(current);
      current = [item];
      anchor = item.y;
    }
  }
  if (current.length > 0) rows.push(current);

  return rows
    .map((row) =>
      row
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str.trim())
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

/**
 * Capitec transaction types that always print their own fee bundled onto the
 * same line as the transaction — verified against a real statement, where
 * every single occurrence of each phrase below had exactly three amounts
 * (transaction, fee, balance), no exceptions. Checking the phrase is a
 * direct, "certain" signal: unlike the balance-chain check below, it doesn't
 * need the previous row to have parsed correctly, so it still works on a
 * statement's very first transaction — which has no previous balance to
 * verify against — or right after any other row that failed to parse.
 *
 * Not exhaustive on purpose. "Online Purchase: Amazon"/"Anthropic" also
 * bundle a fee (a forex charge) while every other "Online Purchase:" merchant
 * doesn't, so the phrase alone can't tell those apart — that case, and any
 * unlisted bank's equivalent, still needs the arithmetic fallback.
 */
const KNOWN_FEE_BUNDLED_RE =
  /^(ATM Cash (Withdrawal|Deposit)|Cash Withdrawal:|Banking App (External|Immediate|Prepaid)|(Immediate )?Capitec Pay Payment)/i;

/**
 * Pull transactions out of a reconstructed line.
 *
 * The last money-shaped token on a line is usually the running balance and the
 * one before it the transaction amount — but plenty of statements print only
 * the amount. We take the earliest amount that isn't the balance, which holds
 * for both layouts.
 */
export function lineToRow(
  line: string,
  fallbackYear: number,
  prevBalance?: number | null,
): ParsedRow | null {
  if (isNoise(line)) return null;

  const dateMatch = line.match(DATE_RE);
  if (!dateMatch) return null;
  const date = parseDate(dateMatch[1], fallbackYear);
  if (!date) return null;

  const amounts = [...line.matchAll(AMOUNT_RE)]
    .map((m) => ({ raw: m[0], index: m.index ?? 0, value: parseAmount(m[0]) }))
    .filter(
      (a) =>
        a.value !== null &&
        a.value !== 0 &&
        // Exclude the date's own digits from being read as money.
        a.index >= (dateMatch.index ?? 0) + dateMatch[1].length,
    );

  if (amounts.length === 0) return null;

  let chosen = amounts.length >= 2 ? amounts[amounts.length - 2] : amounts[0];
  let bundledFee: number | undefined;

  // Three or more amounts is ambiguous. Usually it's [amount, fee, balance] —
  // Capitec prints a transaction's own fee inline on the same line for
  // immediate payments, external payments and ATM withdrawals — but it can
  // also be [foreign amount, rate, ZAR amount, balance] for a forex purchase.
  // The position-only guess above picks whichever sits right before the
  // balance, which is correct for forex and wrong for an inline fee: on a
  // real Capitec statement it read a R6 900 payment as R1, the fee beside it.
  //
  // Two independent ways to tell which case this is, checked in order of how
  // little they depend on: first the phrase itself (KNOWN_FEE_BUNDLED_RE,
  // works in isolation, even on line one of the statement), then the balance
  // chain (needs a verified previous row). Either being satisfied is enough.
  //
  // The fee isn't a separate balance step — Capitec bundles it into the same
  // line as the transaction it belongs to, so prevBalance + amount alone never
  // lands on the printed balance; it takes prevBalance + amount + fee. So the
  // arithmetic check sums every candidate rather than testing them one at a
  // time: if that sum explains the balance move, the earliest candidate is
  // the transaction (the fee is always printed after it, on every real
  // example seen) — a fee is money the transaction cost, not a separate thing
  // that happened. Neither check succeeding falls back to the position guess,
  // so nothing regresses for statements where it was already correct.
  //
  // The fee itself still has to be recorded somewhere: it's real money out
  // that would otherwise vanish, since only `amount` is ever summed. It comes
  // back as `bundledFee` for parsePdf to turn into a row of its own — that
  // was the whole remaining gap after fixing which figure was "the" amount:
  // right transaction, but the fee beside it was validated and then silently
  // discarded, undercounting real spending by exactly what was missing.
  if (amounts.length >= 3) {
    const balance = amounts[amounts.length - 1].value;
    const candidates = amounts.slice(0, -1);
    const leadText = line
      .slice((dateMatch.index ?? 0) + dateMatch[1].length, amounts[0].index)
      .trim();
    const sum = candidates.reduce((s, a) => s + (a.value ?? 0), 0);
    const knownBundled = KNOWN_FEE_BUNDLED_RE.test(leadText);
    const chainVerified =
      prevBalance != null && balance !== null && Math.abs(prevBalance + sum - balance) < 0.01;

    if (knownBundled || chainVerified) {
      chosen = candidates[0];
      const feeSum = candidates.slice(1).reduce((s, a) => s + (a.value ?? 0), 0);
      if (feeSum !== 0) bundledFee = feeSum;
    }
  }

  if (chosen.value === null) return null;

  // Description is what's left between the date and the first amount.
  const descStart = (dateMatch.index ?? 0) + dateMatch[1].length;
  const description =
    line
      .slice(descStart, amounts[0].index)
      .replace(/\s+/g, " ")
      .trim() || "Unknown";

  if (description.length < 2) return null;

  return { date, description, amount: chosen.value, bundledFee };
}

export async function parsePdf(file: File): Promise<ParseResult> {
  // Loaded lazily so the ~300KB worker only costs users who import a PDF.
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;

  const allLines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: TextItem[] = content.items
      .filter((i): i is typeof i & { str: string; transform: number[] } => "str" in i)
      .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5] }));
    allLines.push(...itemsToLines(items));
  }

  if (allLines.length === 0) {
    return {
      rows: [],
      skipped: 0,
      reconciliation: null,
      source: "pdf",
      warning:
        "This PDF has no readable text — it's likely a scan or photo. Try downloading the CSV version from your banking app instead.",
    };
  }

  // Statements often print the year only in a header; use it for bare dates.
  const yearMatch = allLines.join(" ").match(/\b(20\d{2})\b/);
  const fallbackYear = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();

  const rows: ParsedRow[] = [];
  let skipped = 0;
  // Tracks the running balance across lines so lineToRow can verify an
  // ambiguous amount by arithmetic instead of guessing its position.
  let runningBalance: number | null = null;
  // Capitec opens the PDF with a "Scheduled Payments" recap box highlighting
  // a few recurring card charges — each one is printed again, in full, in the
  // real chronological ledger further down. Parsing both double-counts every
  // one: on a real statement that added R331.89 of spending that only
  // happened once. The box has a fixed start and end header, so everything
  // between is skipped outright rather than guessed at per line.
  let inRecapBox = false;
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const trimmed = line.trim();
    if (/^scheduled payments$/i.test(trimmed)) {
      inRecapBox = true;
      continue;
    }
    if (inRecapBox) {
      if (/^spending summary$/i.test(trimmed)) inRecapBox = false;
      continue;
    }

    const row = lineToRow(line, fallbackYear, runningBalance);
    if (row) {
      const { bundledFee, ...transaction } = row;
      rows.push({
        ...transaction,
        description: enrichDescription(transaction.description, allLines, i),
      });
      // A fee bundled onto the same line as its transaction (see lineToRow)
      // is real money out that would otherwise never be counted — it was
      // used to verify the arithmetic, not spent for free. Recorded as its
      // own row, same date, so it shows up as a bank fee like every other one.
      if (bundledFee) {
        rows.push({ date: row.date, description: "Bank Fee", amount: bundledFee });
      }
      const lineBalance = trailingAmount(line);
      if (lineBalance !== null) runningBalance = lineBalance;
    } else if (looksLikeMissedTransaction(line, fallbackYear)) {
      skipped++;
    }
  }

  return {
    rows,
    skipped,
    reconciliation: detectReconciliation(allLines, rows),
    source: "pdf",
  };
}

/**
 * Account numbers referenced by inter-account transfers.
 *
 * A transfer line names the other side: "IB TRANSFER FROM *****2769223".
 * When the same number appears repeatedly, that's the account holder's second
 * account — which means we can offer to import its statement without asking
 * anyone to type an account number.
 *
 * Only the masked tail is kept, which is all the statement prints and all
 * that's needed to tell two accounts apart.
 */
export function detectLinkedAccounts(rows: ParsedRow[]): Array<{
  reference: string;
  transfers: number;
  movedIn: number;
  movedOut: number;
}> {
  const found = new Map<string, { transfers: number; movedIn: number; movedOut: number }>();

  for (const row of rows) {
    if (!/\bIB\s+TRANSFER\b|\bINTERNAL\s+TRANSFER\b|\bTRF\s+(TO|FROM)\b/i.test(row.description)) {
      continue;
    }
    // Masked (*****2769223) or bare account-length digit runs.
    const match = row.description.match(/\*{2,}\s?(\d{4,})|\b(\d{8,})\b/);
    const reference = match?.[1] ?? match?.[2];
    if (!reference) continue;

    const entry = found.get(reference) ?? { transfers: 0, movedIn: 0, movedOut: 0 };
    entry.transfers++;
    if (row.amount >= 0) entry.movedIn += row.amount;
    else entry.movedOut += Math.abs(row.amount);
    found.set(reference, entry);
  }

  return [...found.entries()]
    // One transfer could be to anyone; a repeated destination is an account.
    .filter(([, v]) => v.transfers >= 2)
    .sort((a, b) => b[1].transfers - a[1].transfers)
    .map(([reference, v]) => ({ reference, ...v }));
}

/**
 * Mostly terminal IDs, card masks and timestamps — no merchant in there.
 *
 * The signal is not letter count. "HATFIELD P4 16H58 338279531" spells a
 * suburb, so it clears any letter threshold, yet it names an ATM, not a
 * merchant — the real transaction type ("AUTOBANK CASH DEPOSIT") prints on the
 * next line and used to be dropped, leaving a bare terminal code no
 * categoriser can place. What separates a merchant line from a terminal blob
 * is how many genuine words it carries: a real payee reads as two or more
 * alphabetic words ("SHELL VARSITY", "SHOPRITE VEND"), while a terminal blob is
 * one incidental place name — or a truncated beneficiary like "STANDARDB" —
 * wrapped in codes, timestamps and reference numbers that are not words at all.
 */
function isWeakDescription(description: string): boolean {
  const words = description.split(/\s+/).filter((t) => /^[A-Za-z]{3,}$/.test(t));
  return words.length < 2;
}

/**
 * Recover a merchant name printed on its own line.
 *
 * Standard Bank splits some rows across two lines: the amount line carries
 * only a terminal ID and timestamp, with the transaction type on the line
 * below ("AUTOBANK CASH WITHDRAWAL AT"). Those rows otherwise arrive with
 * descriptions like "0000H422 2026-05-22T10:09:46 5196*9531", which no
 * categoriser can do anything with.
 *
 * Only applied when the row's own description reads as a terminal blob rather
 * than a merchant (see isWeakDescription), so rows that already name their
 * merchant are left untouched.
 */
export function enrichDescription(description: string, lines: string[], index: number): string {
  if (!isWeakDescription(description)) return description;

  const next = lines[index + 1];
  if (!next) return description;

  // Must be a text-only line: no date, no money, or it's another transaction.
  if (DATE_RE.test(next)) return description;
  if (new RegExp(AMOUNT_RE.source, "i").test(next)) return description;

  const letters = next.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4) return description;

  return `${next.trim()} ${description}`.trim();
}

/**
 * Would a human call this a transaction we failed to read?
 *
 * The warning this feeds tells someone their statement may be incomplete, so
 * it has to be quiet unless something was genuinely lost. Requiring a real
 * date, a real amount and description text between them keeps page headers
 * and summary lines from raising a false alarm.
 *
 * Note the fresh RegExp: AMOUNT_RE carries the /g flag, and `.test()` on a
 * global regex advances lastIndex between calls, so reusing it here would
 * make results alternate.
 */
export function looksLikeMissedTransaction(line: string, fallbackYear: number): boolean {
  if (isNoise(line)) return false;

  const dateMatch = line.match(DATE_RE);
  if (!dateMatch || !parseDate(dateMatch[1], fallbackYear)) return false;

  const amounts = line.match(new RegExp(AMOUNT_RE.source, "gi"));
  if (!amounts || amounts.every((a) => parseAmount(a) === null)) return false;

  // Something between the date and the money that reads like a payee.
  const descStart = (dateMatch.index ?? 0) + dateMatch[1].length;
  const rest = line.slice(descStart).replace(new RegExp(AMOUNT_RE.source, "gi"), " ");
  return /[A-Za-z]{3,}/.test(rest);
}

export async function parseStatement(file: File): Promise<ParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return parsePdf(file);
  if (name.endsWith(".csv") || name.endsWith(".txt")) return parseCsv(await file.text());
  throw new Error("Sifa reads PDF and CSV statements. Try one of those.");
}
