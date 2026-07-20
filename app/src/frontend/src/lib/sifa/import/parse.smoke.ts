import {
  parseCsv,
  parseDate,
  parseAmount,
  lineToRow,
  itemsToLines,
  detectReconciliation,
  looksLikeMissedTransaction,
  enrichDescription,
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

console.log("\n── CSV: year-first dates (Capitec/Nedbank exports) ──");
eq("2024/03/01 -> 1 March", parseDate("2024/03/01"), "2024-03-01");
eq("2024.03.01 (dot separator)", parseDate("2024.03.01"), "2024-03-01");
const yearFirstCsv = `Date,Description,Money In,Money Out,Balance
2024/03/01,ENGEN QUICKSHOP,,800.00,4200.00
2024/03/02,SALARY,25000.00,,29200.00`;
const yf = parseCsv(yearFirstCsv);
eq("year-first CSV: both rows read", yf.rows.length, 2);
eq("year-first CSV: date parsed", yf.rows[0].date, "2024-03-01");

console.log("\n── CSV: header row after a metadata preamble (FNB-style export) ──");
// FNB (and others) prepend account/period/opening-balance lines before the
// real header. Assuming row 0 is the header made these preamble rows the
// column map, so the real header row parsed as data and the running BALANCE
// got read as the transaction amount — silently wrong, not just dropped.
const preambleCsv = `Account Number,62123456789
Statement Period,01 Mar 2024 to 31 Mar 2024
Opening Balance,10000.00
Date,Amount,Balance,Description
2024-03-01,-450.50,9549.50,POS WOOLWORTHS`;
const pre = parseCsv(preambleCsv);
eq("preamble rows skipped, one txn found", pre.rows.length, 1);
eq("real amount read, not the balance", pre.rows[0]?.amount, -450.5);
eq("description read, not the header row", pre.rows[0]?.description, "POS WOOLWORTHS");

console.log("\n── CSV: unrecognised description header doesn't collide with the date column ──");
const unknownDescHeader = `Date,Particulars,Amount
2024-03-01,WOOLWORTHS,-450.50`;
const udh = parseCsv(unknownDescHeader);
eq("description isn't the date", udh.rows[0]?.description, "WOOLWORTHS");

console.log("\n── CSV: a separate Fee column (Capitec-style export) ──");
// Capitec prints bank charges in their own "Fee" column, entirely separate
// from Money In/Money Out. A fee-only row has both of those blank, so without
// reading this column every fee row failed the amount check and was silently
// dropped — on a real 7-month statement that was 66 of 299 rows, every bank
// fee on the account, with no warning that anything was missing.
const feeColCsv = `Posting Date,Description,Money In,Money Out,Fee,Balance
2026-01-28,ATM Cash Withdrawal,,-200.00,,225.39
2026-01-28,ATM Cash Withdrawal Fee,,,-10.00,215.39
2026-01-31,Interest Received,0.17,,,169.56`;
const feeCol = parseCsv(feeColCsv);
eq("all three rows read, none dropped as fee-only", feeCol.rows.length, 3);
eq("fee-only row reads as an expense", feeCol.rows[1]?.amount, -10);
eq("fee row keeps its own description", feeCol.rows[1]?.description, "ATM Cash Withdrawal Fee");

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

console.log("\n── amounts printed without a thousands separator ──");
// Requiring a separator made every amount over R999.99 invisible on statements
// that print none, so those rows were dropped whole and the totals ran short.
eq("6250.00 parses", parseAmount("6250.00"), 6250);
const unsep = lineToRow("03 Jun 26 SALARY ACME PAYROLL 6250.00 8420.10", 2026);
eq("ungrouped row is read", unsep?.amount, 6250);
eq("ungrouped row keeps its date", unsep?.date, "2026-06-03");
// The reference-number guard must survive the looser integer part.
eq(
  "reference still can't merge into the amount",
  lineToRow("17 Jun 26 HATFIELD P4 16H58 338279531 600.00 588.66", 2026)?.amount,
  600,
);

console.log("\n── fee and card rows are transactions, not furniture ──");
eq(
  "dated bank charge is kept",
  lineToRow("30 Jun 26 BANK CHARGES MONTHLY FEE 130.00 4211.55", 2026)?.amount,
  130,
);
eq(
  "CONTACTLESS is not a CONTACT header",
  lineToRow("12 Jun 26 CONTACTLESS PURCHASE WOOLWORTHS 250.00 4461.55", 2026)?.amount,
  250,
);
eq(
  "undated footer prose still ignored",
  lineToRow("Bank charges and interest rates are available on request", 2026),
  null,
);

console.log("\n── forex rows: the ZAR amount, not the exchange rate ──");
eq(
  "picks the amount before the balance",
  lineToRow("17 Jun 26 OPENAI *CHATGPT SAN FRANCISCO 20.00 18.45 369.00 4030.55", 2026)
    ?.amount,
  369,
);
eq(
  "forex is unaffected even when a prevBalance is supplied (the sum doesn't validate)",
  lineToRow("17 Jun 26 OPENAI *CHATGPT SAN FRANCISCO 20.00 18.45 369.00 4030.55", 2026, 4030.55)
    ?.amount,
  369,
);

console.log("\n── PDF: a fee bundled onto the transaction's own line (Capitec) ──");
// Real Capitec line. -6 900.00 is the payment, -1.00 is its fee, both printed
// on one line with one balance — prevBalance(7 757.67) - 6 900 - 1 = 856.67.
// Reading this "positionally" (second-to-last of three amounts) picked the
// R1 fee as if it were the whole payment, on a real statement turning a
// R6 900 transfer into R1 and leaving the balance chain R21 000+ short over
// the full document.
const feeLine =
  "02/03/2026 Banking App Immediate Payment: Y. Fan Digital Payments -6 900.00 -1.00 856.67";
eq("main amount, not the fee", lineToRow(feeLine, 2026, 7757.67)?.amount, -6900);
eq("fee captured separately, not dropped", lineToRow(feeLine, 2026, 7757.67)?.bundledFee, -1);
eq(
  "known Capitec fee-bundled phrase resolves correctly with NO prevBalance at all",
  lineToRow(feeLine, 2026)?.amount,
  -6900,
);
eq(
  "unrecognised phrase, no prevBalance to verify against: falls back to the old position guess",
  lineToRow(
    "02/03/2026 Some Unrecognised New Bank Feature Digital Payments -6 900.00 -1.00 856.67",
    2026,
  )?.amount,
  -1,
);
eq(
  "a prevBalance that doesn't explain an unrecognised line's move doesn't force a wrong split",
  lineToRow(
    "02/03/2026 Some Unrecognised New Bank Feature Digital Payments -6 900.00 -1.00 856.67",
    2026,
    0,
  )?.amount,
  -1,
);

console.log("\n── PDF rows split across baseline bands ──");
// pdf.js reports fractionally different baselines within one printed row.
// Banding by Math.round(y / tolerance) split these into two unparseable
// halves, losing the transaction with no warning.
const split = itemsToLines([
  { str: "17 Jun 26", x: 50, y: 700.4 },
  { str: "OPENAI *CHATGPT SAN FRANCISCO", x: 120, y: 701.9 },
  { str: "369.00", x: 400, y: 700.4 },
  { str: "4030.55", x: 470, y: 700.4 },
]);
eq("straddling baselines stay one row", split.length, 1);
eq("row parses", lineToRow(split[0], 2026)?.amount, 369);
// Genuinely separate rows must still separate.
const two = itemsToLines([
  { str: "17 Jun 26 A 10.00", x: 50, y: 700 },
  { str: "18 Jun 26 B 20.00", x: 50, y: 680 },
]);
eq("distinct rows stay distinct", two.length, 2);

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

console.log("\n── two-line rows: the type label prints on the next line ──");
// SBSA splits some rows across two printed lines: the amount line carries only
// a terminal/reference blob, with the transaction type on the line below.
// Judging "weak" by letter count (>=6 letters = good enough) left blobs that
// happen to spell a suburb or a truncated payee un-enriched, so the review
// table showed a bare terminal code and everything landed in "Other".

// A pure terminal blob — no words. The withdrawal type must be recovered.
eq(
  "cash withdrawal label recovered",
  enrichDescription(
    "0000H422 2026-05-22T10:09:46 5196*9531",
    ["0000H422 2026-05-22T10:09:46 5196*9531", "AUTOBANK CASH WITHDRAWAL AT"],
    0,
  ),
  "AUTOBANK CASH WITHDRAWAL AT 0000H422 2026-05-22T10:09:46 5196*9531",
);

// "HATFIELD" is a suburb, not a merchant: 10 letters, so the old letter-count
// rule called it "good enough" and dropped "AUTOBANK CASH DEPOSIT". One alpha
// word wrapped in a terminal ID, timestamp and reference is a blob, not a payee.
eq(
  "cash deposit label recovered past a suburb name",
  enrichDescription(
    "HATFIELD P4 16H58 338279531",
    ["HATFIELD P4 16H58 338279531", "AUTOBANK CASH DEPOSIT"],
    0,
  ),
  "AUTOBANK CASH DEPOSIT HATFIELD P4 16H58 338279531",
);

// "STANDARDB" is a beneficiary name truncated to column width: 9 letters, one
// token, no channel. The old rule saw enough letters and dropped the Payshap
// label, so the user saw only "STANDARDB".
eq(
  "payshap-by-proxy label recovered past a truncated payee",
  enrichDescription(
    "STANDARDB",
    ["STANDARDB", "PAYSHAP PAY BY PROXY"],
    0,
  ),
  "PAYSHAP PAY BY PROXY STANDARDB",
);

// A real merchant already names itself — two+ words — and must be left alone
// even though a redundant type label follows it.
eq(
  "real merchant is not enriched",
  enrichDescription(
    "SHELL VARSITY",
    ["SHELL VARSITY", "DEBIT CARD PURCHASE FROM"],
    0,
  ),
  "SHELL VARSITY",
);
eq(
  "truncated-but-real merchant is not enriched",
  enrichDescription(
    "CHICKEN LICKE",
    ["CHICKEN LICKE", "DEBIT CARD PURCHASE FROM"],
    0,
  ),
  "CHICKEN LICKE",
);
// A card mask alongside a real merchant must not fool the blob detector.
eq(
  "merchant with a card mask is not enriched",
  enrichDescription(
    "SHOPRITE VEND 5196*9531 03 JUL",
    ["SHOPRITE VEND 5196*9531 03 JUL", "FEE-ELECTRONIC ACCOUNT PAYMENT"],
    0,
  ),
  "SHOPRITE VEND 5196*9531 03 JUL",
);
// The forward-only reading is correct for the R2.00 fee: it IS a fee, so
// "FEE-ELECTRONIC ACCOUNT PAYMENT" is its right label. A backward lookup would
// steal the previous row's "IB PAYMENT TO" and mislabel the fee.
eq(
  "digit-only fee row takes its own forward label",
  enrichDescription(
    "10218876171",
    [
      "IB PAYMENT TO",
      "10218876171",
      "FEE-ELECTRONIC ACCOUNT PAYMENT",
    ],
    1,
  ),
  "FEE-ELECTRONIC ACCOUNT PAYMENT 10218876171",
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

console.log("\n── closing balance vs. available balance (Capitec prints both) ──");
// Real Capitec statement: "Closing Balance: R360.71" and "Available Balance:
// R330.71" a line apart — different concepts (available reflects a pending
// hold), not two readings of the same figure. Matching either interchangeably
// picked whichever appeared last in the document — coincidentally the
// available one — leaving a R30 gap that had nothing to do with the
// transactions being wrong.
const capitecLines = [
  "From Date: 01/07/2025 Opening Balance: R54.62",
  "To Date: 20/07/2026 Closing Balance: R360.71",
  "Print Date: 20/07/2026 18:48 Available Balance: R330.71",
];
const capitecRec = detectReconciliation(capitecLines, [
  { date: "2026-01-01", description: "A", amount: 306.09 },
]);
eq("prefers the true closing balance over available", capitecRec?.closing, 360.71);
eq("reconciles against it correctly", capitecRec?.matches, true);

// Standard Bank never prints an explicit "Closing Balance" line — only
// "Available Balance" — so that must still work as the fallback.
eq(
  "falls back to available balance when no closing wording exists",
  detectReconciliation(recLines, [{ date: "2026-04-22", description: "A", amount: -88.67 }])
    ?.closing,
  16.14,
);

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILURES"}`);
