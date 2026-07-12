import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Send, ArrowUpRight, ArrowDownRight, Sparkles } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useSifa, formatZAR } from "@/lib/sifa/context";
import { computeInsights, askSifaStub } from "@/lib/sifa/insights";
import { LockedOverlay } from "@/components/sifa/locked-overlay";
import { TransactionSheet } from "@/components/sifa/transaction-sheet";
import type { Transaction } from "@/lib/sifa/types";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

const PIE_COLORS = ["#2F6F5E", "#1E4B3F", "#D89A3D", "#B45B47", "#7A7263", "#16231C"];

function DashboardPage() {
  const { transactions, features } = useSifa();
  const [openTx, setOpenTx] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [ask, setAsk] = useState("");
  const [askAnswer, setAskAnswer] = useState<string | null>(null);

  const stats = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    const monthTx = transactions.filter((t) => {
      const d = new Date(t.date);
      return d.getMonth() === m && d.getFullYear() === y;
    });
    const income = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expenses = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const saved = income - expenses;
    const savedPct = income > 0 ? Math.round((saved / income) * 100) : 0;

    const byCat = new Map<string, number>();
    for (const t of monthTx) {
      if (t.type !== "expense") continue;
      byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount);
    }
    const pie = [...byCat.entries()].map(([name, value]) => ({ name, value }));
    return { income, expenses, saved, savedPct, pie };
  }, [transactions]);

  const insights = useMemo(() => computeInsights(transactions), [transactions]);

  const recent = transactions.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Hero saved */}
      <section className="rounded-3xl border border-hair bg-card p-6 sm:p-8">
        <p className="text-xs font-medium uppercase tracking-widest text-muted">Saved this month</p>
        <p className="mt-2 font-mono text-4xl font-semibold tabular-nums text-ink sm:text-5xl">
          {formatZAR(stats.saved)}
        </p>
        <p className={`mt-1 text-sm ${stats.saved >= 0 ? "text-emerald" : "text-brick"}`}>
          {stats.income > 0 ? `${stats.savedPct}% of income` : "Log income to see your savings rate"}
        </p>
      </section>

      {/* Stat row */}
      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Income" amount={stats.income} tone="emerald" icon={<ArrowUpRight className="h-4 w-4" />} />
        <StatCard label="Expenses" amount={stats.expenses} tone="brick" icon={<ArrowDownRight className="h-4 w-4" />} />
        <StatCard label="Saved" amount={stats.saved} tone={stats.saved >= 0 ? "emerald" : "brick"} icon={<ArrowUpRight className="h-4 w-4" />} />
      </section>

      {/* Where it went + Insights */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-hair bg-card p-6">
          <h2 className="font-display text-xl font-semibold">Where it went</h2>
          {stats.pie.length === 0 ? (
            <div className="mt-6 flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-muted">Log your first transaction to see this fill in.</p>
              <button
                onClick={() => {
                  setEditing(null);
                  setOpenTx(true);
                }}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-ink px-5 text-sm font-semibold text-paper hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> Add transaction
              </button>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-[160px_1fr] items-center">
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stats.pie} dataKey="value" innerRadius={40} outerRadius={70} paddingAngle={2} stroke="none">
                      {stats.pie.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-1.5 text-sm">
                {stats.pie.map((p, i) => (
                  <li key={p.name} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-ink">{p.name}</span>
                    </span>
                    <span className="font-mono tabular-nums text-muted">{formatZAR(p.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* AI insights */}
        <div className="relative overflow-hidden rounded-3xl border border-ink bg-ink p-6 text-paper">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-gold" />
            <h2 className="font-display text-xl font-semibold">What Sifa noticed</h2>
          </div>
          <ul className={`mt-4 space-y-2 text-sm ${features.aiInsights ? "" : "blur-sm select-none"}`} aria-hidden={!features.aiInsights}>
            {insights.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                <span className="text-paper/85">{line}</span>
              </li>
            ))}
          </ul>

          {/* Ask Sifa */}
          <div className={`mt-5 rounded-2xl bg-ink-2 p-3 ${features.askSifa ? "" : "blur-sm select-none"}`} aria-hidden={!features.askSifa}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!features.askSifa) return;
                // TODO: connect to AI backend.
                setAskAnswer(askSifaStub(ask));
              }}
              className="flex items-center gap-2"
            >
              <input
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                placeholder="Ask Sifa…"
                className="min-h-[40px] flex-1 rounded-full bg-paper/10 px-4 text-sm text-paper placeholder:text-paper/50 focus:outline-none"
              />
              <button
                type="submit"
                className="inline-grid h-10 w-10 place-items-center rounded-full bg-gold text-ink hover:brightness-95"
                aria-label="Ask Sifa"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
            {askAnswer ? <p className="mt-3 text-sm text-paper/85">{askAnswer}</p> : null}
          </div>

          {!features.aiInsights ? (
            <LockedOverlay title="AI insights are a Pro feature" body="Unlock monthly patterns, category trends, and Ask Sifa." />
          ) : null}
        </div>
      </section>

      {/* Recent transactions */}
      <section className="rounded-3xl border border-hair bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Recent transactions</h2>
          <button
            onClick={() => {
              setEditing(null);
              setOpenTx(true);
            }}
            className="hidden min-h-[40px] items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold text-paper hover:opacity-90 md:inline-flex"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>

        {recent.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No transactions yet. Add your first to get started.</p>
        ) : (
          <ul className="mt-3 divide-y divide-dashed divide-hair">
            {recent.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => {
                    setEditing(t);
                    setOpenTx(true);
                  }}
                  className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-paper/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{t.description}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-hair/60 px-2 py-0.5 text-[10px] font-medium text-muted">
                        {t.category}
                      </span>
                      <span className="text-[11px] text-muted">{t.date}</span>
                    </div>
                  </div>
                  <span
                    className={`font-mono tabular-nums text-sm ${
                      t.type === "expense" ? "text-brick" : "text-emerald"
                    }`}
                  >
                    {t.type === "expense" ? "-" : "+"}
                    {formatZAR(t.amount).replace("-", "")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* FAB (mobile) */}
      <button
        onClick={() => {
          setEditing(null);
          setOpenTx(true);
        }}
        aria-label="Add transaction"
        className="fixed bottom-20 right-5 z-20 inline-grid h-14 w-14 place-items-center rounded-full bg-emerald text-paper shadow-lg shadow-emerald/30 transition hover:brightness-110 md:hidden"
      >
        <Plus className="h-6 w-6" />
      </button>

      <TransactionSheet open={openTx} onOpenChange={setOpenTx} editing={editing} />
    </div>
  );
}

function StatCard({ label, amount, tone, icon }: { label: string; amount: number; tone: "emerald" | "brick"; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-hair bg-card p-4">
      <div className="flex items-center justify-between text-muted">
        <p className="text-[11px] font-semibold uppercase tracking-widest">{label}</p>
        <span className={tone === "emerald" ? "text-emerald" : "text-brick"}>{icon}</span>
      </div>
      <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums text-ink">{formatZAR(amount)}</p>
    </div>
  );
}
