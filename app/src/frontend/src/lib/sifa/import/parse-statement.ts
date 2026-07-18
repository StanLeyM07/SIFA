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
  /** Statement total if we found one, for reconciliation against our sum. */
  detectedTotal: number | null;
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

const AMOUNT_RE = /\(?-?R?\s?\d{1,3}(?:[\s,]\d{3})*(?:[.,]\d{2})?-?\)?(?:\s?(?:DR|CR))?/gi;
const DATE_RE =
  /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{1,2}\s?[A-Za-z]{3,9}\.?\s?\d{0,4})\b/;

/** Rows that are statement furniture rather than transactions. */
const NOISE = [
  "OPENING BALANCE", "CLOSING BALANCE", "BALANCE BROUGHT", "BALANCE CARRIED",
  "BROUGHT FORWARD", "CARRIED FORWARD", "STATEMENT PERIOD", "AVAILABLE BALANCE",
  "TOTAL CREDITS", "TOTAL DEBITS", "PAGE ", "VAT REG", "ACCOUNT NUMBER",
  "ACCOUNT HOLDER", "STATEMENT NO", "CONTACT", "CUSTOMER CARE",
];

function isNoise(line: string): boolean {
  const u = line.toUpperCase();
  return NOISE.some((n) => u.includes(n));
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
    return { rows: [], skipped: 0, detectedTotal: null, source: "csv", warning: "The file was empty." };
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

  return { rows: out, skipped, detectedTotal: null, source: "csv" };
}

// ── PDF ──────────────────────────────────────────────────────

interface TextItem {
  str: string;
  x: number;
  y: number;
}

/** Group text items into visual rows by y-position, then order each by x. */
function itemsToLines(items: TextItem[], tolerance = 3): string[] {
  const buckets = new Map<number, TextItem[]>();

  for (const item of items) {
    if (!item.str.trim()) continue;
    // Snap to a tolerance band so items on the same printed line group together
    // even when their baselines differ by a fraction of a point.
    const key = Math.round(item.y / tolerance);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  return [...buckets.entries()]
    .sort((a, b) => b[0] - a[0]) // pdf y grows upward, so descending = top-down
    .map(([, row]) =>
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
function lineToRow(line: string, fallbackYear: number): ParsedRow | null {
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
      detectedTotal: null,
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
  for (const line of allLines) {
    const row = lineToRow(line, fallbackYear);
    if (row) rows.push(row);
    else if (DATE_RE.test(line) && AMOUNT_RE.test(line) && !isNoise(line)) skipped++;
  }

  return { rows, skipped, detectedTotal: null, source: "pdf" };
}

export async function parseStatement(file: File): Promise<ParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return parsePdf(file);
  if (name.endsWith(".csv") || name.endsWith(".txt")) return parseCsv(await file.text());
  throw new Error("Sifa reads PDF and CSV statements. Try one of those.");
}
