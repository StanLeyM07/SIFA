import { normalizeDescription } from "./normalize.js";
import { categorizeOne, categorizeAll, applyCorrection } from "./engine.js";

// Realistic SA statement lines, as they actually appear on FNB/Capitec/Absa.
const cases: Array<[string, number, string]> = [
  ["POS PURCHASE WOOLWORTHS 1234 SANDTON CITY 12/03", -450.5, "Groceries"],
  ["FNB APP PAYMENT TO CHECKERS HYPER *4471", -1203.99, "Groceries"],
  ["PNP CRN RIVONIA", -230.0, "Groceries"],
  ["CARD PURCHASE AT ENGEN QUICKSHOP 08/11", -800.0, "Transport"],
  ["DEBIT ORDER DSTV PREMIUM 08052341", -929.0, "Subscriptions"],
  ["EFT TO VODACOM PREPAID 2023-10-15", -199.0, "Utilities"],
  ["MUGG & BEAN MENLYN", -145.0, "Eating out"],
  ["DISCHEM PHARMACIES 4471 CENTURION", -320.4, "Health"],
  ["TAKEALOT COM ONLINE", -1899.0, "Shopping"],
  ["SALARY ACB CREDIT OCT", 25000.0, "Salary"],
  ["INTERNET BANKING PAYMENT TO J SMITH", -500.0, "Other"],
  // Bank charges were a third of the rows on a real SA statement, so they get
  // their own category rather than disappearing into "Other".
  ["MONTHLY ACCOUNT SERVICE FEE", -105.0, "Bank fees"],
  ["FEE: PREPAID MOBILE PURCHASE", -1.0, "Bank fees"],
  ["EXCESS INTEREST", -0.09, "Bank fees"],
  ["VAS VODA AIRTIME", -29.0, "Airtime & data"],
  ["AUTOBANK CASH WITHDRAWAL AT", -500.0, "Cash"],
  // As it actually prints on a Standard Bank statement. ("IB TRANSFER TO X"
  // is stripped as a channel prefix by design, leaving the destination — that
  // is correct for merchant matching, so it isn't tested as a transfer here.)
  ["IB TRANSFER 6014432", -1000.0, "Transfers"],
  // Statements clip descriptions; "CHICKEN LICKEN" arrives truncated.
  ["CHICKEN LICKE 5196*9531", -55.0, "Eating out"],
];

let pass = 0;
/** Declared explicitly: an undeclared `fails++` throws under ES module strict
 *  mode, so a genuine regression would have crashed the run instead of being
 *  reported as a failure. */
let fails = 0;
console.log("desc -> normalized | category (source, conf)\n");
for (const [desc, amt, expected] of cases) {
  const m = categorizeOne(desc, amt);
  const ok = m.category === expected;
  if (ok) pass++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  "${normalizeDescription(desc)}"  -> ${m.category} (${m.source}, ${m.confidence})${ok ? "" : `  EXPECTED ${expected}`}`,
  );
}
console.log(`\n${pass}/${cases.length} matched expectation`);

// ── Inter-account transfers ──────────────────────────────────
// Standard Bank marks these IB TRANSFER TO / FROM. Both directions must be
// caught: on a real statement the outgoing one was normalised down to "H"
// (because "IB TRANSFER TO" is stripped as a channel prefix) and counted as
// R2 000 of spending, while the incoming ones were correctly excluded.
console.log("\n── inter-account transfers (both directions) ──");
for (const [desc, amt] of [
  ["IB Transfer to *****2769223 09H20 *****9531", -2000],
  ["IB TRANSFER FROM *****2769223 10H38 *****9531", 1000],
  ["INTERNAL TRANSFER TO SAVINGS", -500],
  ["TRF TO 620183", -300],
] as Array<[string, number]>) {
  const m = categorizeOne(desc, amt);
  const ok = m.category === "Transfers";
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${desc.slice(0, 44)} -> ${m.category}`);
}

// The load-bearing distinction: a PAYMENT is money leaving for someone else,
// so it must stay real spending. Treating it as movement would erase genuine
// expenses from every total.
console.log("\n── payments to third parties stay spending ──");
for (const [desc, amt] of [
  ["IB PAYMENT TO WOOLWORTHS", -450],
  ["IB PAYMENT TO J SMITH RENT", -6500],
] as Array<[string, number]>) {
  const m = categorizeOne(desc, amt);
  const ok = m.category !== "Transfers";
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${desc.slice(0, 44)} -> ${m.category}`);
}

// Money between *people* is income or spending, not movement. Transfers is
// excluded from every derived total, so a bank name or a person-to-person
// rail landing there erases real money: "CAPITEC Y FAN" is a R3 200 payment
// from another person, and matching the bank name filed it as a self-transfer
// until the dashboard reported R0 income for the month.
console.log("\n── money between people is not movement ──");
for (const [desc, amt, want] of [
  ["CAPITEC Y FAN", 3200, "income"],
  ["CAPITEC *** Y FAN 12H03", 3200, "income"],
  ["PAYSHAP PAYMENT FROM T MOKOENA", 500, "income"],
  ["PAYSHAP PAYMENT TO T MOKOENA", -500, "expense"],
  ["INSTANT MONEY VOUCHER", -250, "expense"],
] as Array<[string, number, string]>) {
  const m = categorizeOne(desc, amt);
  const ok = m.category !== "Transfers" && m.type === want;
  if (!ok) fails++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${desc.slice(0, 34).padEnd(34)} -> ${m.category}/${m.type}`,
  );
}

// A bank name must still reach bank fees when that is what the line says.
const bankFee = categorizeOne("CAPITEC BANK FEE", -50);
if (bankFee.category !== "Bank fees") fails++;
console.log(
  `${bankFee.category === "Bank fees" ? "PASS" : "FAIL"}  CAPITEC BANK FEE -> ${bankFee.category}`,
);

// Type inference on income
const sal = categorizeOne("SALARY ACB CREDIT OCT", 25000);
console.log(`\nincome type: ${sal.type} (expect income)`);

// Correction learning: an unknown merchant, corrected once, sticks.
const unknown = "CARD PURCHASE AT ZAKHELE SPAZA 4471";
console.log(`before correction: ${categorizeOne(unknown, -50).category} (expect Other)`);
const corrections = applyCorrection({}, unknown, "Groceries");
const after = categorizeOne("POS PURCHASE ZAKHELE SPAZA 9987 12/04", -75, corrections);
console.log(`after correction (different line, same shop): ${after.category} (${after.source})`);

// Coverage over the batch
const summary = categorizeAll(cases.map(([description, amount]) => ({ date: "2024-01-01", description, amount })));
console.log(`\ncoverage: ${(summary.coverage * 100).toFixed(0)}%  needsReview: ${summary.needsReview}`);

console.log(`
${fails === 0 && pass === cases.length ? "ALL PASS" : fails + " FAILURES"}`);
process.exit(fails === 0 ? 0 : 1);
