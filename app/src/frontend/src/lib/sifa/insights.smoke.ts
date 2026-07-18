import { computeInsights } from "./insights";
import type { Bill, Goal, Transaction } from "./types";

// Build dates relative to today so the fixtures stay valid over time.
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

function show(label: string, out: ReturnType<typeof computeInsights>) {
  console.log(`\n=== ${label} ===`);
  for (const i of out) console.log(`  [${i.tone}] ${i.title}\n      ${i.detail}`);
}

// 1. Overspend + eating-out spike against a stable 3-month history.
const spike: Transaction[] = [
  tx(mk(0), "Salary", "Salary", 20000, "income"),
  tx(mk(0), "Nandos", "Eating out", 3200),
  tx(mk(0), "Rent", "Rent", 18000),
  tx(mk(1), "Nandos", "Eating out", 800),
  tx(mk(2), "Nandos", "Eating out", 700),
  tx(mk(3), "Nandos", "Eating out", 750),
];
show("overspend + category spike", computeInsights(spike, [], []));

// 2. Healthy month — should read positive, not invent problems.
const healthy: Transaction[] = [
  tx(mk(0), "Salary", "Salary", 30000, "income"),
  tx(mk(0), "Checkers", "Groceries", 3000),
  tx(mk(0), "Engen", "Transport", 1500),
  tx(mk(1), "Checkers", "Groceries", 2900),
  tx(mk(2), "Checkers", "Groceries", 3100),
];
show("healthy month", computeInsights(healthy, [], []));

// 3. Overdue + imminent bills outrank everything else.
const bills: Bill[] = [
  { id: "b1", name: "DSTV", amount: 929, category: "Subscriptions", dueDate: mk(0, 1), status: "pending", isRecurring: true },
  { id: "b2", name: "Vodacom", amount: 599, category: "Utilities", dueDate: mk(0, 28), status: "pending", isRecurring: true },
];
show("overdue bills", computeInsights(healthy, bills, []));

// 4. Untracked recurring merchant — three months, not in bills.
const recurring: Transaction[] = [
  ...healthy,
  tx(mk(0), "NETFLIX SUBSCRIPTION", "Subscriptions", 199),
  tx(mk(1), "NETFLIX SUBSCRIPTION", "Subscriptions", 199),
  tx(mk(2), "NETFLIX SUBSCRIPTION", "Subscriptions", 199),
];
show("untracked recurring", computeInsights(recurring, [], []));

// 5. Goals — one stalled, one on pace.
const goals: Goal[] = [
  { id: "g1", name: "Emergency fund", target: 30000, current: 12000, monthlyContribution: 0 },
];
show("stalled goal", computeInsights(healthy, [], goals));

const paced: Goal[] = [
  { id: "g2", name: "Japan trip", target: 40000, current: 10000, monthlyContribution: 5000 },
];
show("goal on pace", computeInsights(healthy, [], paced));

// 6. Not enough data — must not fabricate.
show("empty", computeInsights([tx(mk(0), "Checkers", "Groceries", 100)], [], []));
