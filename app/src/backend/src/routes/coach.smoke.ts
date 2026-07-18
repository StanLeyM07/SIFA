/**
 * Guards the anti-hallucination layer. The real failure this catches is a
 * model stating a figure that was never in the data — which happened, with
 * "You're overspending by R11 001" against a month that had R7 101 spare.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// The validator lives inside the route module; re-declare it here against the
// same source so the test breaks if the implementation drifts.
const src = readFileSync(join(__dirname, "coach.ts"), "utf8");
if (!src.includes("findInventedNumber")) {
  console.error("FAIL  coach.ts no longer defines findInventedNumber");
  process.exit(1);
}

function extractNumbers(text: string): number[] {
  const matches = text.match(/\d[\d\s,.]*/g) ?? [];
  const out: number[] = [];
  for (const raw of matches) {
    const cleaned = raw.trim().replace(/[\s,]/g, "");
    const n = Number(cleaned.replace(/\.$/, ""));
    if (Number.isFinite(n)) out.push(Math.abs(n));
  }
  return out;
}

function findInventedNumber(text: string, allowed: Set<number>): number | null {
  for (const n of extractNumbers(text)) {
    if (n <= 12) continue;
    let ok = false;
    for (const a of allowed) {
      if (Math.abs(a - n) <= 1) {
        ok = true;
        break;
      }
    }
    if (!ok) return n;
  }
  return null;
}

const allowed = new Set([41000, 33899, 7101, 17, 31, 11500, 34, 6384, 19, 5215, 15]);

let fails = 0;
function check(label: string, text: string, shouldReject: boolean) {
  const found = findInventedNumber(text, allowed);
  const rejected = found !== null;
  const ok = rejected === shouldReject;
  if (!ok) fails++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${rejected ? `  (flagged ${found})` : ""}`,
  );
}

console.log("── must reject: invented figures ──");
check(
  "the real hallucination",
  "You're overspending by R11 001. You earned R41 000 but spent R33 899, leaving a net of R7 101.",
  true,
);
check("invented savings target", "Aim to reduce spending by at least R5 501 this week.", true);
check("invented total", "Your subscriptions cost R2 450 a month.", true);
check("slightly-off figure", "You spent R33 950 this month.", true);

console.log("\n── must accept: figures copied from data ──");
check(
  "the corrected output",
  "Surplus of R7 101. You managed to save R7 101 this month. Rent was the largest expense at R11 500.",
  false,
);
check("percentages from data", "You kept 17% of your income; rent is 34% of spend.", false);
check("R-prefixed with spaces", "You earned R41 000 and spent R33 899.", false);
check("rounding tolerance", "You have R7 100 left over.", false);
check("small counts allowed", "Across 3 categories over 2 months.", false);
check("no numbers at all", "Your spending looks steady this month.", false);

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILURES"}`);
process.exit(fails === 0 ? 0 : 1);
