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
const CLOSING_RE = /(?:statement\s+)?closing balance|balance carried forward|available balance|balance c\/f/i;

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

  for (const line of lines) {
    if (opening === null && OPENING_RE.test(line)) {
      const v = trailingAmount(line);
      if (v !== null) opening = v;
    }
    if (CLOSING_RE.test(line)) {
      const v = trailingAmount(line);
      // Take the last closing-shaped figure; statements repeat it per page.
      if (v !== null) closing = v;
    }
  }

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

  const headers = rows[0].map((h) => String(h ?? "").trim().toLowerCase());
  const hasHeader =
    findCol(headers, DATE_HEADERS) >= 0 ||
    findCol(headers, AMOUNT_HEADERS) >= 0 ||
    findCol(headers, DEBIT_HEADERS) >= 0;

  let dateCol = 0;
  let descCol = 1;
  let amountCol = 2;
  let debitCol = -1;
  let creditCol = -1;

  if (hasHeader) {
    dateCol = Math.max(0, findCol(headers, DATE_HEADERS));
    descCol = Math.max(0, findCol(headers, DESC_HEADERS));
    amountCol = findCol(headers, AMOUNT_HEADERS);
    debitCol = findCol(headers, DEBIT_HEADERS);
    creditCol = findCol(headers, CREDIT_HEADERS);
  }

  const out: ParsedRow[] = [];
  let skipped = 0;

  for (let i = hasHeader ? 1 : 0; i < rows.length; i++) {
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
    if (debitCol >= 0 || creditCol >= 0) {
      // Separate debit/credit columns: whichever is populated wins.
      const debit = debitCol >= 0 ? parseAmount(cols[debitCol] ?? "") : null;
      const credit = creditCol >= 0 ? parseAmount(cols[creditCol] ?? "") : null;
      if (debit) amount = -Math.abs(debit);
      else if (credit) amount = Math.abs(credit);
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
 * Pull transactions out of a reconstructed line.
 *
 * The last money-shaped token on a line is usually the running balance and the
 * one before it the transaction amount — but plenty of statements print only
 * the amount. We take the earliest amount that isn't the balance, which holds
 * for both layouts.
 */
export function lineToRow(line: string, fallbackYear: number): ParsedRow | null {
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

  const chosen = amounts.length >= 2 ? amounts[amounts.length - 2] : amounts[0];
  if (chosen.value === null) return null;

  // Description is what's left between the date and the first amount.
  const descStart = (dateMatch.index ?? 0) + dateMatch[1].length;
  const description =
    line
      .slice(descStart, amounts[0].index)
      .replace(/\s+/g, " ")
      .trim() || "Unknown";

  if (description.length < 2) return null;

  return { date, description, amount: chosen.value };
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
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const row = lineToRow(line, fallbackYear);
    if (row) {
      rows.push({ ...row, description: enrichDescription(row.description, allLines, i) });
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

/** Mostly terminal IDs, card masks and timestamps — no merchant in there. */
function isWeakDescription(description: string): boolean {
  const letters = description.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 6) return false;
  return true;
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
 * Only applied when the row's own description carries almost no letters, so
 * rows that already name their merchant are left untouched.
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
