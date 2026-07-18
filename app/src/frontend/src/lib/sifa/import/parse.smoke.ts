import {
  parseCsv,
  parseDate,
  parseAmount,
  lineToRow,
  detectReconciliation,
  looksLikeMissedTransaction,
} from "./parse-statement";

let fails = 0;
function eq(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
}

console.log("── dates (SA day-first) ──");
eq("2024-03-05", parseDate("2024-03-05"), "2024-03-05");
eq("05/03/2024 -> 5 March", parseDate("05/03/2024"), "2024-03-05");
eq("05-03-24", parseDate("05-03-24"), "2024-03-05");
eq("5 Mar 2024", parseDate("5 Mar 2024"), "2024-03-05");
eq("05 MAR (fallback yr)", parseDate("05 MAR", 2023), "2023-03-05");
eq("garbage -> null", parseDate("not a date"), null);
eq("month 13 rejected", parseDate("05/13/2024"), null);

console.log("\n── amounts ──");
eq("1 234.56", parseAmount("1 234.56"), 1234.56);
eq("R1,234.56", parseAmount("R1,234.56"), 1234.56);
eq("1 234,56 (comma dec)", parseAmount("1 234,56"), 1234.56);
eq("trailing minus", parseAmount("450.00-"), -450);
eq("brackets", parseAmount("(450.00)"), -450);
eq("Dr suffix", parseAmount("450.00Dr"), -450);
eq("Cr suffix", parseAmount("450.00Cr"), 450);
eq("empty -> null", parseAmount(""), null);

console.log("\n── CSV: standard header ──");
const standard = `Date,Description,Amount
2024-03-01,WOOLWORTHS SANDTON,-450.50
2024-03-02,"CHECKERS HYPER, RIVONIA",-1203.99
2024-03-25,SALARY DEPOSIT,25000.00
Opening Balance,,,`;
const a = parseCsv(standard);
eq("3 rows", a.rows.length, 3);
eq("quoted comma kept whole", a.rows[1].description, "CHECKERS HYPER, RIVONIA");
eq("negative preserved", a.rows[0].amount, -450.5);
eq("income positive", a.rows[2].amount, 25000);

console.log("\n── CSV: separate debit/credit columns ──");
const dc = `Transaction Date,Narrative,Debit,Credit
05/03/2024,ENGEN QUICKSHOP,800.00,
06/03/2024,SALARY,,25000.00`;
const b = parseCsv(dc);
eq("2 rows", b.rows.length, 2);
eq("debit -> negative", b.rows[0].amount, -800);
eq("credit -> positive", b.rows[1].amount, 25000);
eq("day-first date", b.rows[0].date, "2024-03-05");

console.log("\n── CSV: no header ──");
const noHeader = `2024-03-01,PICK N PAY,-230.00
2024-03-02,DSTV PREMIUM,-929.00`;
const c = parseCsv(noHeader);
eq("2 rows", c.rows.length, 2);
eq("desc read", c.rows[0].description, "PICK N PAY");

console.log("\n── CSV: noise rows dropped ──");
const noisy = `Date,Description,Amount
2024-03-01,WOOLWORTHS,-100.00
2024-03-02,Closing Balance,15000.00
Statement Period,01 Mar - 31 Mar,`;
const d = parseCsv(noisy);
eq("only the real txn", d.rows.length, 1);

console.log("\n── PDF lines: reference numbers must not become amounts ──");
// Real Standard Bank line. The reference ends in 531 and the amount is 600.00,
// so treating space as a thousands separator read it as R531 600.
const sbsa = lineToRow("17 Jun 26 HATFIELD P4 16H58 338279531 600.00 588.66", 2026);
eq("amount is 600, not 531600", sbsa?.amount, 600);
eq("date read", sbsa?.date, "2026-06-17");
eq("description excludes the reference", /HATFIELD/.test(sbsa?.description ?? ""), true);

const sbsa2 = lineToRow("17 Jun 26 HATFIELD P4 16H59 338279531 390.00 967.86", 2026);
eq("second line amount is 390", sbsa2?.amount, 390);

// A genuine thousands-separated amount must still parse.
const big = lineToRow("05 May 26 SALARY DEPOSIT 25 400.00 26 000.00", 2026);
eq("real thousands amount survives", big?.amount, 25400);

console.log("\n── page furniture must not raise a false warning ──");
for (const junk of [
  "From: 17 Apr 26",
  "To: 16 Jul 26",
  "16 Jul 2026",
  "3 month statement",
  "Transaction details Available Balance: R16.14",
  "STATEMENT OPENING BALANCE 104.81",
]) {
  const flagged = looksLikeMissedTransaction(junk, 2026);
  if (flagged) fails++;
  console.log(`${!flagged ? "PASS" : "FAIL"}  ignored: "${junk.slice(0, 46)}"`);
}
// A real transaction line we failed to read SHOULD still warn.
eq(
  "genuine unreadable row still warns",
  looksLikeMissedTransaction("22 Apr 26 SHELL VARSITY GARAGE 37.5O 104.81", 2026),
  true,
);

console.log("\n── reconciliation against the bank's own balances ──");
const recLines = [
  "STATEMENT OPENING BALANCE 104.81",
  "Available Balance: R16.14",
];
const good = detectReconciliation(recLines, [
  { date: "2026-04-22", description: "A", amount: -37.5 },
  { date: "2026-04-25", description: "B", amount: -51.17 },
]);
eq("matches when the maths lands", good?.matches, true);
eq("net computed", good?.net, -88.67);

const bad = detectReconciliation(recLines, [
  { date: "2026-04-22", description: "A", amount: -37.5 },
]);
eq("flags a mismatch", bad?.matches, false);
eq("reports the gap", bad?.difference, 51.17);

eq("silent when balances absent", detectReconciliation(["nothing here"], []), null);

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILURES"}`);
