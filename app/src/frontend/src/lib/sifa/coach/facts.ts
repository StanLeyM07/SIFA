import type { Bill, Goal, Transaction } from "../types";
import { isMoneyMovement } from "../types";

/**
 * The financial fact sheet handed to the LLM.
 *
 * Deliberately aggregates only — no descriptions, no merchant names, no dates
 * of individual transactions, nothing that identifies a person or a shop.
 * Three things fall out of that:
 *
 *  1. The model cannot invent a figure, because every number it is allowed to
 *     use is already computed and present here.
 *  2. Nothing identifying leaves the device, so the privacy promise holds even
 *     when the coach is on.
 *  3. The prompt is a few hundred tokens instead of a few thousand, which is
 *     what makes running this per-user affordable.
 */
export interface FactSheet {
  month: string;
  /**
   * The surplus/deficit call, made here rather than left to the model.
   * Small models reliably get this backwards when asked to infer it, so the
   * conclusion is computed and the model only writes prose around it.
   */
  verdict: "surplus" | "deficit" | "breakeven" | "no-income-recorded";
  income: number;
  expenses: number;
  net: number;
  savingsRatePct: number | null;
  transactionCount: number;
  topCategories: Array<{ category: string; amount: number; pctOfSpend: number }>;
  movers: Array<{ category: string; amount: number; average: number; changePct: number }>;
  previousMonth: { income: number; expenses: number; net: number } | null;
  bills: { pendingCount: number; pendingTotal: number; overdueCount: number } | null;
  goals: Array<{ name: string; target: number; current: number; monthly: number; monthsLeft: number | null }>;
}

const monthKey = (iso: string) => iso.slice(0, 10).slice(0, 7);

function keyFor(offset: number): string {
  const d = new Date();
  const p = new Date(d.getFullYear(), d.getMonth() - offset, 1);
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}`;
}

function monthTotals(transactions: Transaction[], key: string) {
  const byCategory = new Map<string, number>();
  let income = 0;
  let expenses = 0;
  let count = 0;

  for (const t of transactions) {
    if (monthKey(t.date) !== key) continue;
    // Internal transfers are movement, not earning or spending.
    if (isMoneyMovement(t.category)) continue;
    count++;
    if (t.type === "income") {
      income += t.amount;
    } else {
      expenses += t.amount;
      byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount);
    }
  }
  return { income, expenses, byCategory, count };
}

const round = (n: number) => Math.round(n);

export function buildFactSheet(
  transactions: Transaction[],
  bills: Bill[],
  goals: Goal[],
): FactSheet {
  const thisKey = keyFor(0);
  const cur = monthTotals(transactions, thisKey);
  const prevKey = keyFor(1);
  const prev = monthTotals(transactions, prevKey);

  const topCategories = [...cur.byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, amount]) => ({
      category,
      amount: round(amount),
      pctOfSpend: cur.expenses > 0 ? Math.round((amount / cur.expenses) * 100) : 0,
    }));

  // Categories moving materially against their own 3-month average.
  const priors = [1, 2, 3].map((o) => monthTotals(transactions, keyFor(o)));
  const movers: FactSheet["movers"] = [];
  for (const [category, amount] of cur.byCategory) {
    const history = priors
      .map((p) => p.byCategory.get(category))
      .filter((v): v is number => v !== undefined && v > 0);
    if (history.length < 2) continue;
    const average = history.reduce((s, v) => s + v, 0) / history.length;
    const changePct = Math.round(((amount - average) / average) * 100);
    if (Math.abs(changePct) < 25 || Math.abs(amount - average) < 200) continue;
    movers.push({ category, amount: round(amount), average: round(average), changePct });
  }
  movers.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

  const todayISO = new Date().toISOString().slice(0, 10);
  const pending = bills.filter((b) => b.status === "pending");

  const net = cur.income - cur.expenses;

  return {
    month: new Date().toLocaleDateString("en-ZA", { month: "long", year: "numeric" }),
    verdict:
      cur.income <= 0
        ? "no-income-recorded"
        : net > 0
          ? "surplus"
          : net < 0
            ? "deficit"
            : "breakeven",
    income: round(cur.income),
    expenses: round(cur.expenses),
    net: round(cur.income - cur.expenses),
    savingsRatePct:
      cur.income > 0 ? Math.round(((cur.income - cur.expenses) / cur.income) * 100) : null,
    transactionCount: cur.count,
    topCategories,
    movers: movers.slice(0, 3),
    previousMonth:
      prev.count > 0
        ? {
            income: round(prev.income),
            expenses: round(prev.expenses),
            net: round(prev.income - prev.expenses),
          }
        : null,
    bills:
      bills.length > 0
        ? {
            pendingCount: pending.length,
            pendingTotal: round(pending.reduce((s, b) => s + b.amount, 0)),
            overdueCount: pending.filter((b) => b.dueDate < todayISO).length,
          }
        : null,
    goals: goals.slice(0, 3).map((g) => ({
      name: g.name,
      target: round(g.target),
      current: round(g.current),
      monthly: round(g.monthlyContribution),
      monthsLeft:
        g.monthlyContribution > 0 && g.current < g.target
          ? Math.ceil((g.target - g.current) / g.monthlyContribution)
          : null,
    })),
  };
}

/**
 * Stable fingerprint of a fact sheet. The coach response is cached against
 * this, so we only spend a call when the underlying numbers actually move —
 * not on every dashboard render.
 */
export function factsFingerprint(facts: FactSheet): string {
  const s = JSON.stringify(facts);
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}
