import { parseCsv, parseDate, parseAmount } from "./parse-statement";

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

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILURES"}`);
