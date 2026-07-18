import { buildFactSheet, factsFingerprint } from "./facts";
import type { Bill, Goal, Transaction } from "../types";

const now = new Date();
const mk = (monthsAgo: number, day = 15) => {
  const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

let n = 0;
const tx = (
  date: string,
  description: string,
  category: string,
  amount: number,
  type: "income" | "expense" = "expense",
): Transaction => ({ id: `t${n++}`, date, description, category, amount, type });

let fails = 0;
function eq(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
}

const txs: Transaction[] = [
  tx(mk(0), "Salary", "Salary", 25000, "income"),
  tx(mk(0), "Checkers", "Groceries", 4000),
  tx(mk(0), "Nandos", "Eating out", 3200),
  tx(mk(0), "Engen", "Transport", 1800),
  tx(mk(1), "Salary", "Salary", 25000, "income"),
  tx(mk(1), "Checkers", "Groceries", 3800),
  tx(mk(1), "Nandos", "Eating out", 800),
  tx(mk(2), "Nandos", "Eating out", 700),
  tx(mk(3), "Nandos", "Eating out", 750),
];

const bills: Bill[] = [
  { id: "b1", name: "DSTV", amount: 929, category: "Subscriptions", dueDate: mk(0, 1), status: "pending", isRecurring: true },
];
const goals: Goal[] = [
  { id: "g1", name: "Emergency fund", target: 30000, current: 12000, monthlyContribution: 3000 },
];

const f = buildFactSheet(txs, bills, goals);

console.log("── totals ──");
eq("income", f.income, 25000);
eq("expenses", f.expenses, 9000);
eq("net", f.net, 16000);
eq("savings rate", f.savingsRatePct, 64);
eq("txn count (this month)", f.transactionCount, 4);

console.log("\n── categories ──");
eq("top category is Groceries", f.topCategories[0].category, "Groceries");
eq("groceries pct of spend", f.topCategories[0].pctOfSpend, 44);
eq("three categories", f.topCategories.length, 3);

console.log("\n── movers ──");
eq("eating out flagged", f.movers[0]?.category, "Eating out");
eq("eating out average", f.movers[0]?.average, 750);
eq("eating out change %", f.movers[0]?.changePct, 327);
eq("groceries not a mover (stable)", f.movers.find((m) => m.category === "Groceries"), undefined);

console.log("\n── prior month / bills / goals ──");
eq("prev month income", f.previousMonth?.income, 25000);
eq("bills pending", f.bills?.pendingCount, 1);
eq("bills overdue", f.bills?.overdueCount, 1);
eq("goal months left", f.goals[0].monthsLeft, 6);

console.log("\n── privacy: no identifying data in payload ──");
const serialized = JSON.stringify(f);
for (const leak of ["Checkers", "Nandos", "Engen", "Salary Deposit", "t0"]) {
  const found = serialized.includes(leak);
  if (found && leak !== "Salary") fails++;
  console.log(`${!found ? "PASS" : "FAIL"}  merchant "${leak}" absent from payload`);
}

console.log("\n── fingerprint stability ──");
eq("same input, same fingerprint", factsFingerprint(f), factsFingerprint(buildFactSheet(txs, bills, goals)));
const changed = buildFactSheet([...txs, tx(mk(0), "Woolworths", "Groceries", 500)], bills, goals);
console.log(
  `${factsFingerprint(changed) !== factsFingerprint(f) ? "PASS" : "FAIL"}  changed input -> new fingerprint`,
);
if (factsFingerprint(changed) === factsFingerprint(f)) fails++;

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILURES"}`);
