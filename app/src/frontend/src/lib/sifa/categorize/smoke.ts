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

// ── Real Standard Bank lines (verbatim, 3-month statement) ───
// These are the raw post-enrichment descriptions off an actual statement —
// truncated names, card fragments (5196*9531), embedded dates and the two
// different garage prefixes ("ENGEN DUNCUN" vs "C*ENGEN HATFI"). They exercise
// the FULL pipeline (normalise -> tokenize -> matchMerchant), not the isolated
// merchant unit test, which is where earlier "correct in theory" rules slipped.
console.log("\n── real Standard Bank statement lines ──");
for (const [desc, amt, expected] of [
  // Garages: same merchant, two prefix styles the statement actually prints.
  ["SHELL VARSITY 5196*9531 20 APR", -37.5, "Transport"],
  ["ENGEN DUNCUN 5196*9531 18 JUN", -22.3, "Transport"],
  ["C*ENGEN HATFI 5196*9531 06 JUL", -27.9, "Transport"],
  ["DL UBER 5196*9531 21 JUN", -21.0, "Transport"],
  // Fast food, mostly truncated by the statement's fixed width.
  ["KFC MABILO HA 5196*9531 19 JUN", -30.0, "Eating out"],
  ["KFC KRANSKOP 5196*9531 05 JUL", -30.0, "Eating out"],
  ["CHICKENHUB 5196*9531 25 APR", -24.0, "Eating out"],
  ["CHICKEN LICKE 5196*9531 23 JUN", -60.0, "Eating out"], // truncated, via prefix match through the real pipeline
  ["STEERS ENG PRETORIA ZAF 06-07-2026 20H37:14", -8.5, "Eating out"], // POS-abroad format, trailing timestamp
  // Groceries. PNP CRP is high-frequency on this statement — lock it down.
  ["PNP CRP HATFI 5196*9531 26 APR", -15.99, "Groceries"],
  ["SHOPRITE VEND 5196*9531 03 JUL", -460.86, "Groceries"],
  ["CHOICE BUTCHE 5196*9531 03 JUL", -656.69, "Groceries"], // "Choice Butche[ry]" truncated
  // Clothing / fashion retailers.
  ["PEP 8715 THOH 5196*9531 30 JUN", -69.97, "Shopping"],
  ["EXACT THOHOYA 5196*9531 03 JUL", -601.77, "Shopping"],
  ["MARKHAM THOHO 5196*9531 03 JUL", -800.0, "Shopping"],
  ["BASH BASH TFG ACC 5196*9531", -160.0, "Shopping"],
  // Subscriptions and airtime.
  ["OPENAI SAN FRANCISCO USA 27-05-2026 17H48:33", -8.5, "Subscriptions"],
  ["VAS0022 VODA0606730770", -5.0, "Airtime & data"], // Vodacom prepaid voucher: digits glued to letters, collapses to "VAS VODA"
  // Cash movement.
  ["AUTOBANK CASH WITHDRAWAL AT BRANCH", -500.0, "Cash"],
] as Array<[string, number, string]>) {
  const m = categorizeOne(desc, amt);
  const ok = m.category === expected;
  if (!ok) fails++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${desc.slice(0, 40).padEnd(40)} -> ${m.category}${ok ? "" : `  EXPECTED ${expected}`}`,
  );
}

// ── Bank fees: the word "FEE" is not always the first token ──
// Standard Bank prints the charge type ahead of "FEE": "CASH DEPOSIT FEE" was
// filed as a *deposit* (money IN) because the "CASH DEPOSIT" rule matched
// before the old tokens[0]==="FEE" guard could fire. A fee counted as income
// is the worst kind of error here — it inflates what the month looked like it
// earned. The guard now scans the whole line for a standalone FEE token.
console.log("\n── bank fees with FEE mid-line ──");
for (const [desc, amt] of [
  ["CASH DEPOSIT FEE - AUTOBANK", -12.0], // regressed to Deposits before the fix
  ["CASH WITHDRAWAL FEE", -10.0],
  ["MONTHLY MANAGEMENT FEE", -105.0],
  ["FEE-ELECTRONIC ACCOUNT PAYMENT", -3.5], // hyphen, not colon
  ["FEE- POS DECLINED INSUFF FUNDS", -8.0],
  ["FEE: PAYSHAP PAY BY PROXY", -1.5],
  ["EXCESS INTEREST", -0.09], // no FEE token — carried by the merchant dictionary
] as Array<[string, number]>) {
  const m = categorizeOne(desc, amt);
  const ok = m.category === "Bank fees";
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${desc.slice(0, 40).padEnd(40)} -> ${m.category}`);
}

// ── Honest "Other" beats a confident wrong guess ─────────────
// Some lines name a payment RAIL, not a shop (Yoco/SnapScan/Zapper card
// machines hide the real merchant), or are genuinely unidentifiable. Guessing
// a specific category (Yoco -> Shopping) is wrong more often than right on a
// statement where "the analysis is not always correct". These must land in
// "Other" rather than a fabricated category. A recognised rail is confident
// Other; a fully unknown line falls through to review (source "none").
console.log("\n── unknown/opaque lines resolve to Other ──");
for (const [desc, amt, wantSource] of [
  ["YOCO *SHOPP 5196*9531 23 APR", -25.0, "merchant"], // recognised rail, but Other not Shopping
  ["C*IDENTITY 03 5196*9531 03 JUL", -170.0, "none"], // unidentifiable -> flag for review
  ["BLW ZONE G DSP PT THANKSGIVING", -250.0, "none"], // no readable merchant at all
] as Array<[string, number, string]>) {
  const m = categorizeOne(desc, amt);
  const ok = m.category === "Other" && m.source === wantSource;
  if (!ok) fails++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${desc.slice(0, 40).padEnd(40)} -> ${m.category}/${m.source}`,
  );
}

// A bare bank name is not evidence of a fee — the same blind spot as the
// CAPITEC-as-Transfers bug below, for a different rule. On a real statement
// "PAYSHAP PAY BY PROXY STANDARDB" is a R125 payment to someone (StandardB is
// the recipient, not "your bank charged you"), but a "Bank" alias entry
// matched "STANDARDB" before the PayShap rule got a chance, filing a real
// third-party payment as a bank fee.
console.log("\n── a bank's name in a payment isn't a fee ──");
for (const [desc, amt] of [
  ["PAYSHAP PAY BY PROXY STANDARDB", -125.0],
  ["PAYSHAP PAY BY PROXY STANDARDB", -100.0],
] as Array<[string, number]>) {
  const m = categorizeOne(desc, amt);
  const ok = m.category !== "Bank fees";
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${desc.slice(0, 44)} -> ${m.category}${ok ? "" : "  EXPECTED not Bank fees"}`);
}

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

// Capitec's automatic Live Better round-ups/sweeps, verified against a real
// 7-month CSV export. The generic TRANSFER-FROM-SAVINGS rule above doesn't
// catch these because "Live Better" sits between FROM and Savings Account.
console.log("\n── Capitec Live Better round-ups/sweeps ──");
for (const [desc, amt] of [
  ["Live Better Round-up Transfer", -1.1],
  ["Live Better Interest Sweep", -0.17],
  ["Banking App Transfer from Live Better Savings Account (1816119146)", 2.28],
] as Array<[string, number]>) {
  const m = categorizeOne(desc, amt);
  const ok = m.category === "Transfers";
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${desc.slice(0, 60)} -> ${m.category}`);
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
