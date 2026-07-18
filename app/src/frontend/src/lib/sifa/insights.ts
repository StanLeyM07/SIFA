import type { Bill, Goal, Transaction } from "./types";
import { isMoneyMovement } from "./types";
import { normalizeDescription } from "./categorize/normalize";

/**
 * Deterministic financial insights.
 *
 * Everything here is computed from the user's own data — no model, no network,
 * no tokens. That is partly a cost decision, but mostly a correctness one: a
 * computed insight cannot state a number that isn't true, and in a finance app
 * a confidently wrong figure is worse than no figure at all.
 *
 * Each rule is a pure function returning zero or one Insight. Rules that can't
 * say anything useful return nothing rather than padding with filler.
 */

export type InsightTone = "critical" | "warning" | "positive" | "neutral";

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  detail: string;
  /** Higher surfaces first. Critical findings outrank encouragement. */
  priority: number;
}

const ZAR = (n: number) =>
  `R${Math.round(Math.abs(n)).toLocaleString("en-ZA")}`;

/** "2026-07" — string slicing avoids the timezone bugs Date parsing invites. */
const monthKey = (iso: string) => iso.slice(0, 7);

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function priorMonthKeys(count: number): string[] {
  const keys: string[] = [];
  const d = new Date();
  for (let i = 1; i <= count; i++) {
    const p = new Date(d.getFullYear(), d.getMonth() - i, 1);
    keys.push(`${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

interface Totals {
  income: number;
  expenses: number;
  byCategory: Map<string, number>;
}

function totalsForMonth(transactions: Transaction[], key: string): Totals {
  const byCategory = new Map<string, number>();
  let income = 0;
  let expenses = 0;

  for (const t of transactions) {
    if (monthKey(t.date) !== key) continue;
    // Transfers between the user's own accounts are neither, and counting
    // them makes someone look like they earned money they merely moved.
    if (isMoneyMovement(t.category)) continue;
    if (t.type === "income") {
      income += t.amount;
    } else {
      expenses += t.amount;
      byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount);
    }
  }

  return { income, expenses, byCategory };
}

// ── Rules ────────────────────────────────────────────────────

/** Spending more than you earned is the single most important thing to say. */
function ruleOverspend(cur: Totals): Insight | null {
  if (cur.income <= 0 || cur.expenses <= cur.income) return null;
  const over = cur.expenses - cur.income;
  return {
    id: "overspend",
    tone: "critical",
    title: `You're ${ZAR(over)} over what you earned this month`,
    detail: `Spent ${ZAR(cur.expenses)} against ${ZAR(cur.income)} income. Trimming your biggest category is the fastest way back.`,
    priority: 100,
  };
}

function ruleSavingsRate(cur: Totals): Insight | null {
  if (cur.income <= 0 || cur.expenses > cur.income) return null;
  const saved = cur.income - cur.expenses;
  const pct = Math.round((saved / cur.income) * 100);

  if (pct >= 20) {
    return {
      id: "savings-rate",
      tone: "positive",
      title: `You're keeping ${pct}% of your income`,
      detail: `That's ${ZAR(saved)} put aside this month. Anything above 20% is a strong month.`,
      priority: 30,
    };
  }
  return {
    id: "savings-rate",
    tone: "neutral",
    title: `You're keeping ${pct}% of your income`,
    detail: `${ZAR(saved)} left over. Getting to 20% would mean freeing up about ${ZAR(cur.income * 0.2 - saved)} more.`,
    priority: 35,
  };
}

/**
 * Category spend against its own recent average.
 *
 * Compares to a multi-month average rather than just last month, so one odd
 * month doesn't manufacture a false alarm. Requires at least two prior months
 * of history in that category before it will say anything.
 */
function ruleCategorySpike(
  transactions: Transaction[],
  cur: Totals,
): Insight | null {
  const priors = priorMonthKeys(3).map((k) => totalsForMonth(transactions, k));

  let worst: { cat: string; now: number; avg: number; pct: number } | null = null;

  for (const [cat, now] of cur.byCategory) {
    const history = priors
      .map((p) => p.byCategory.get(cat))
      .filter((v): v is number => v !== undefined && v > 0);

    if (history.length < 2) continue;

    const avg = history.reduce((s, v) => s + v, 0) / history.length;
    // Ignore noise: needs to be both a real proportional jump and real money.
    if (now < avg * 1.3 || now - avg < 200) continue;

    const pct = Math.round(((now - avg) / avg) * 100);
    if (!worst || pct > worst.pct) worst = { cat, now, avg, pct };
  }

  if (!worst) return null;
  return {
    id: "category-spike",
    tone: "warning",
    title: `${worst.cat} is up ${worst.pct}% on your usual`,
    detail: `${ZAR(worst.now)} this month against a ${ZAR(worst.avg)} average over the last few months.`,
    priority: 70,
  };
}

function ruleOverdueBills(bills: Bill[]): Insight | null {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = bills.filter((b) => b.status === "pending" && b.dueDate < today);
  if (overdue.length === 0) return null;

  const total = overdue.reduce((s, b) => s + b.amount, 0);
  return {
    id: "overdue-bills",
    tone: "critical",
    title:
      overdue.length === 1
        ? `${overdue[0].name} is overdue`
        : `${overdue.length} bills are overdue`,
    detail: `${ZAR(total)} outstanding. ${overdue.length === 1 ? "It was" : "The oldest was"} due ${overdue.map((b) => b.dueDate).sort()[0]}.`,
    priority: 95,
  };
}

function ruleBillsDueSoon(bills: Bill[], cur: Totals): Insight | null {
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const horizon = new Date(today.getTime() + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const soon = bills.filter(
    (b) => b.status === "pending" && b.dueDate >= todayISO && b.dueDate <= horizon,
  );
  if (soon.length === 0) return null;

  const total = soon.reduce((s, b) => s + b.amount, 0);
  const headroom = cur.income - cur.expenses;

  // Only worth flagging if it's tight — otherwise it's just noise.
  if (headroom > total * 1.5) return null;

  return {
    id: "bills-due-soon",
    tone: headroom < total ? "critical" : "warning",
    title: `${ZAR(total)} in bills due within a week`,
    detail:
      headroom < total
        ? `You have ${ZAR(headroom)} left this month — that's ${ZAR(total - headroom)} short.`
        : `That's most of the ${ZAR(headroom)} you have left this month.`,
    priority: 90,
  };
}

function ruleSubscriptionLoad(cur: Totals): Insight | null {
  const subs = cur.byCategory.get("Subscriptions") ?? 0;
  if (subs <= 0 || cur.income <= 0) return null;

  const pct = Math.round((subs / cur.income) * 100);
  if (pct < 10) return null;

  return {
    id: "subscription-load",
    tone: "warning",
    title: `Subscriptions are ${pct}% of your income`,
    detail: `${ZAR(subs)} a month on recurring services. Worth checking which ones you still actually use.`,
    priority: 60,
  };
}

/**
 * A merchant charged in three consecutive months that isn't tracked as a bill.
 * These are the subscriptions people forget they have.
 *
 * Two guards keep this from firing on ordinary repeat shopping: only
 * categories where a fixed recurring charge is plausible, and the amount has
 * to be roughly stable month to month. Buying groceries at Checkers every
 * month is not a forgotten debit order — a R199 charge three months running is.
 */
const RECURRING_CATEGORIES = new Set(["Subscriptions", "Utilities", "Rent", "Health"]);

function ruleUntrackedRecurring(
  transactions: Transaction[],
  bills: Bill[],
): Insight | null {
  const months = [currentMonthKey(), ...priorMonthKeys(2)];
  const seen = new Map<
    string,
    { label: string; months: Set<string>; amounts: number[] }
  >();

  for (const t of transactions) {
    if (t.type !== "expense") continue;
    if (!RECURRING_CATEGORIES.has(t.category)) continue;
    const mk = monthKey(t.date);
    if (!months.includes(mk)) continue;

    const key = normalizeDescription(t.description);
    if (!key) continue;

    const entry = seen.get(key) ?? { label: t.description, months: new Set<string>(), amounts: [] };
    entry.months.add(mk);
    entry.amounts.push(t.amount);
    seen.set(key, entry);
  }

  const trackedBills = new Set(bills.map((b) => normalizeDescription(b.name)));

  // Surface the largest qualifying charge — that's the one worth acting on.
  let best: { label: string; amount: number } | null = null;

  for (const [key, entry] of seen) {
    if (entry.months.size < 3) continue;
    if (trackedBills.has(key)) continue;

    const min = Math.min(...entry.amounts);
    const max = Math.max(...entry.amounts);
    if (min <= 0 || max / min > 1.15) continue; // varies too much to be a fixed charge

    const avg = entry.amounts.reduce((s, v) => s + v, 0) / entry.amounts.length;
    if (!best || avg > best.amount) best = { label: entry.label, amount: avg };
  }

  if (!best) return null;
  return {
    id: "untracked-recurring",
    tone: "neutral",
    title: `${best.label.trim()} charges you every month`,
    detail: `About ${ZAR(best.amount)} for three months running, and it isn't in your bills. Add it so it shows up in what's coming.`,
    priority: 55,
  };
}

function ruleConcentration(cur: Totals): Insight | null {
  if (cur.expenses <= 0) return null;
  // With two or three categories a "top category" is trivially most of the
  // spend, so saying so is filler. Only meaningful once spending is spread out.
  if (cur.byCategory.size < 4) return null;

  let top: [string, number] | null = null;
  for (const entry of cur.byCategory) {
    if (!top || entry[1] > top[1]) top = entry;
  }
  if (!top) return null;

  const pct = Math.round((top[1] / cur.expenses) * 100);
  if (pct < 40) return null;

  return {
    id: "concentration",
    tone: "neutral",
    title: `${top[0]} is ${pct}% of everything you spent`,
    detail: `${ZAR(top[1])} of ${ZAR(cur.expenses)}. Not a problem in itself — just where the leverage is if you want to cut.`,
    priority: 40,
  };
}

function ruleGoalPace(goals: Goal[]): Insight | null {
  if (goals.length === 0) return null;

  const stalled = goals.find((g) => g.monthlyContribution <= 0 && g.current < g.target);
  if (stalled) {
    return {
      id: "goal-stalled",
      tone: "warning",
      title: `"${stalled.name}" has no monthly contribution`,
      detail: `${ZAR(stalled.current)} of ${ZAR(stalled.target)} saved, but nothing scheduled — so it isn't moving.`,
      priority: 50,
    };
  }

  const active = goals.find((g) => g.current < g.target && g.monthlyContribution > 0);
  if (!active) return null;

  const months = Math.ceil((active.target - active.current) / active.monthlyContribution);
  const done = new Date();
  done.setMonth(done.getMonth() + months);
  const when = done.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });

  return {
    id: "goal-pace",
    tone: "positive",
    title: `"${active.name}" lands in ${when}`,
    detail: `${months} month${months === 1 ? "" : "s"} to go at ${ZAR(active.monthlyContribution)} a month.`,
    priority: 25,
  };
}

// ── Entry point ──────────────────────────────────────────────

export function computeInsights(
  transactions: Transaction[],
  bills: Bill[] = [],
  goals: Goal[] = [],
  limit = 4,
): Insight[] {
  if (transactions.length < 3) {
    return [
      {
        id: "empty",
        tone: "neutral",
        title: "Add a few more transactions",
        detail:
          "Once Sifa has a couple of weeks of spending to look at, it'll start flagging patterns on its own.",
        priority: 0,
      },
    ];
  }

  const cur = totalsForMonth(transactions, currentMonthKey());

  const found = [
    ruleOverdueBills(bills),
    ruleBillsDueSoon(bills, cur),
    ruleOverspend(cur),
    ruleCategorySpike(transactions, cur),
    ruleSubscriptionLoad(cur),
    ruleUntrackedRecurring(transactions, bills),
    ruleGoalPace(goals),
    ruleConcentration(cur),
    ruleSavingsRate(cur),
  ].filter((i): i is Insight => i !== null);

  if (found.length === 0) {
    return [
      {
        id: "steady",
        tone: "positive",
        title: "Nothing unusual this month",
        detail: "Your spending is tracking close to normal across every category.",
        priority: 0,
      },
    ];
  }

  return found.sort((a, b) => b.priority - a.priority).slice(0, limit);
}

/** Consecutive days (ending today, or yesterday if nothing logged yet today)
 * on which at least one transaction was recorded. Uses UTC day boundaries to
 * match how `todayISO()` stamps new transactions. */
export function computeStreak(transactions: Transaction[]): number {
  if (transactions.length === 0) return 0;
  const days = new Set(transactions.map((t) => t.date));

  const cursor = new Date();
  const isoUTC = (d: Date) => d.toISOString().slice(0, 10);
  // If today isn't logged yet, the streak still counts the run ending yesterday,
  // so the user sees it's alive and knows to log today to keep it going.
  if (!days.has(isoUTC(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);

  let streak = 0;
  while (days.has(isoUTC(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
