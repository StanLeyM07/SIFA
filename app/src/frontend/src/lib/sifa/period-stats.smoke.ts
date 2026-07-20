import { computePeriodStats } from "./period-stats";
import type { Transaction } from "./types";

let fails = 0;
function eq(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
}

// Dates built relative to "now" so the suite doesn't go stale — a fixed date
// in a monthly-bucketed test rots the moment the clock crosses a month.
function monthsAgo(n: number, day = 15): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n, day);
  return d.toISOString().slice(0, 10);
}

let id = 0;
function tx(partial: Partial<Transaction>): Transaction {
  id++;
  return {
    id: `t${id}`,
    date: monthsAgo(0),
    description: "x",
    category: "Other",
    amount: 0,
    type: "expense",
    ...partial,
  };
}

console.log("── this month only (months=1) matches the original dashboard scope ──");
const txns = [
  tx({ date: monthsAgo(0), type: "income", amount: 1000, category: "Salary" }),
  tx({ date: monthsAgo(0), type: "expense", amount: 400, category: "Groceries" }),
  tx({ date: monthsAgo(1), type: "income", amount: 5000, category: "Salary" }),
  tx({ date: monthsAgo(1), type: "expense", amount: 3000, category: "Rent" }),
  tx({ date: monthsAgo(4), type: "expense", amount: 999, category: "Shopping" }),
];
const one = computePeriodStats(txns, 1);
eq("only this month's income", one.income, 1000);
eq("only this month's expenses", one.expenses, 400);
eq("saved", one.saved, 600);
eq("savedPct", one.savedPct, 60);
eq("count", one.count, 2);

console.log("\n── widening the window pulls in prior months ──");
const three = computePeriodStats(txns, 3);
eq("income across this + prior 2 months", three.income, 6000);
eq("expenses across this + prior 2 months", three.expenses, 3400);
eq("4-months-ago row excluded from a 3-month window", three.count, 4);

const twelve = computePeriodStats(txns, 12);
eq("12-month window includes everything", twelve.count, 5);
eq("12-month income", twelve.income, 6000);
eq("12-month expenses", twelve.expenses, 4399);

console.log("\n── transfers excluded from every window, not just the current month ──");
const withTransfer = [
  ...txns,
  tx({ date: monthsAgo(2), type: "income", amount: 2000, category: "Transfers" }),
  tx({ date: monthsAgo(2), type: "expense", amount: 2000, category: "Transfers" }),
];
const threeWithTransfer = computePeriodStats(withTransfer, 3);
eq("transfer income excluded", threeWithTransfer.income, three.income);
eq("transfer expense excluded", threeWithTransfer.expenses, three.expenses);

console.log("\n── category breakdown (pie) sums correctly across the window ──");
const pieMap = Object.fromEntries(three.pie.map((p) => [p.name, p.value]));
eq("Groceries in range", pieMap["Groceries"], 400);
eq("Rent in range", pieMap["Rent"], 3000);
eq("Shopping (4 months ago) excluded from a 3-month window", pieMap["Shopping"], undefined);

console.log("\n── empty ledger doesn't divide by zero ──");
const empty = computePeriodStats([], 6);
eq("zero income", empty.income, 0);
eq("savedPct is 0, not NaN, with no income", empty.savedPct, 0);

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILURES"}`);
