import {
  duplicateKey,
  selectRowsToImport,
  countDuplicates,
} from "./import-selection";

let fails = 0;
function eq(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
}

const rows = [
  { date: "2024-03-01", description: "WOOLWORTHS", amount: -450.5 },
  { date: "2024-03-02", description: "PNP", amount: -120 },
  { date: "2024-03-25", description: "SALARY", amount: 25000 },
];

console.log("── duplicateKey ──");
eq("case/space-insensitive on description", duplicateKey({ date: "2024-03-01", description: "  woolworths ", amount: -450.5 }), duplicateKey(rows[0]));
eq("amount rounded to cents", duplicateKey({ date: "2024-03-01", description: "WOOLWORTHS", amount: -450.500001 }), duplicateKey(rows[0]));

console.log("\n── first-ever import: empty ledger ──");
const emptyLedger = new Set<string>();
eq("all rows import when ledger empty", selectRowsToImport(rows, emptyLedger, true).length, 3);
eq("no duplicates against empty ledger", countDuplicates(rows, emptyLedger), 0);

console.log("\n── re-import of the exact same statement ──");
// After the first import the ledger holds every row; a second run must skip all.
const fullLedger = new Set(rows.map(duplicateKey));
eq("skip=true imports nothing", selectRowsToImport(rows, fullLedger, true).length, 0);
eq("all flagged as duplicates", countDuplicates(rows, fullLedger), 3);
eq("skip=false forces all through (user override)", selectRowsToImport(rows, fullLedger, false).length, 3);

console.log("\n── partial overlap ──");
const partial = new Set([duplicateKey(rows[0])]);
eq("only the new rows import", selectRowsToImport(rows, partial, true).map((r) => r.description), ["PNP", "SALARY"]);
eq("one duplicate counted", countDuplicates(rows, partial), 1);

console.log("\n── the done-headline regression ──");
// Reproduces the shipped bug: the done screen recomputed the count against the
// ledger AFTER the import, so imported rows counted as duplicates and a real
// import announced zero. The count must be taken at confirm time.
const confirmCount = selectRowsToImport(rows, emptyLedger, true).length; // 3, captured at confirm
const ledgerAfterImport = new Set(
  [...selectRowsToImport(rows, emptyLedger, true), /* pre-existing */].map(duplicateKey),
);
const recomputedAfter = selectRowsToImport(rows, ledgerAfterImport, true).length; // 0, the bug
eq("count captured at confirm is correct", confirmCount, 3);
eq("recomputing after the ledger update is wrong (documents the trap)", recomputedAfter, 0);

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILURES"}`);
