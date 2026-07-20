import type { Transaction } from "./types";
import { isMoneyMovement } from "./types";

export interface PeriodStats {
  income: number;
  expenses: number;
  saved: number;
  savedPct: number;
  pie: Array<{ name: string; value: number }>;
  count: number;
}

/** "2026-07" for the given date — string slicing avoids the timezone bugs
 *  Date parsing invites, same convention insights.ts uses. */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Totals over a rolling window of whole calendar months, ending with the
 * current one. `months=1` is just the current month — the dashboard's
 * original scope, unchanged — `months=3/6/12` widen it for a longer view.
 *
 * Transfers between the user's own accounts are excluded throughout: they're
 * money moving, not earning or spending, and counting them makes a month
 * that was really a self-transfer look like an overspend (or a windfall).
 */
export function computePeriodStats(transactions: Transaction[], months: number): PeriodStats {
  const now = new Date();
  const cutoff = monthKey(new Date(now.getFullYear(), now.getMonth() - (months - 1), 1));

  const inRange = transactions.filter(
    (t) => t.date.slice(0, 7) >= cutoff && !isMoneyMovement(t.category),
  );

  const income = inRange.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expenses = inRange.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const saved = income - expenses;
  const savedPct = income > 0 ? Math.round((saved / income) * 100) : 0;

  const byCat = new Map<string, number>();
  for (const t of inRange) {
    if (t.type !== "expense") continue;
    byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount);
  }
  const pie = [...byCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }));

  return { income, expenses, saved, savedPct, pie, count: inRange.length };
}
