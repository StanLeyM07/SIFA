import type { Transaction } from "./types";

// Local rule-based insights.
// TODO: replace with real AI-generated insights from backend (Supabase edge function
// calling an LLM with the user's monthly transaction history).
export function computeInsights(transactions: Transaction[]): string[] {
  if (transactions.length === 0) {
    return ["Log a few transactions and Sifa will start spotting patterns for you."];
  }

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const lastMonthDate = new Date(thisYear, thisMonth - 1, 1);
  const lastMonth = lastMonthDate.getMonth();
  const lastYear = lastMonthDate.getFullYear();

  const inMonth = (t: Transaction, m: number, y: number) => {
    const d = new Date(t.date);
    return d.getMonth() === m && d.getFullYear() === y;
  };

  const sumByCat = (m: number, y: number) => {
    const map = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      if (!inMonth(t, m, y)) continue;
      map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
    }
    return map;
  };

  const cur = sumByCat(thisMonth, thisYear);
  const prev = sumByCat(lastMonth, lastYear);

  const insights: string[] = [];
  for (const [cat, amt] of cur.entries()) {
    const prevAmt = prev.get(cat) ?? 0;
    if (prevAmt > 0 && amt > prevAmt * 1.2) {
      const pct = Math.round(((amt - prevAmt) / prevAmt) * 100);
      insights.push(`${cat} is up ${pct}% versus last month.`);
    }
  }

  const incomeCur = transactions
    .filter((t) => t.type === "income" && inMonth(t, thisMonth, thisYear))
    .reduce((s, t) => s + t.amount, 0);
  const expenseCur = [...cur.values()].reduce((s, v) => s + v, 0);
  if (incomeCur > 0) {
    const savedPct = Math.round(((incomeCur - expenseCur) / incomeCur) * 100);
    if (savedPct >= 20) insights.push(`Nice — you're keeping ${savedPct}% of income this month.`);
    else if (savedPct < 0) insights.push(`You've spent more than you earned this month. Time to trim one category.`);
    else insights.push(`You're saving ${savedPct}% of income this month.`);
  }

  if (insights.length === 0) insights.push("Nothing unusual this month. Steady as she goes.");
  return insights.slice(0, 3);
}

// TODO: connect to AI backend.
export function askSifaStub(question: string): string {
  const q = question.trim();
  if (!q) return "Ask me anything about your money.";
  if (/save|saving/i.test(q)) return "You're saving about a fifth of your income this month. Trim eating out and you'd push it to a quarter.";
  if (/spend|spent|where/i.test(q)) return "Your biggest category this month is Groceries, followed by Transport.";
  if (/goal/i.test(q)) return "At your current pace, your top goal lands roughly on schedule. Push R500 more each month and you'd be a month early.";
  return "I'm still learning your patterns — log a full month of transactions and I'll give you sharper answers.";
}
