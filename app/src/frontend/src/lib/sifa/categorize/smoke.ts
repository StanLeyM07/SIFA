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
  ["MONTHLY ACCOUNT SERVICE FEE", -105.0, "Other"],
];

let pass = 0;
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
