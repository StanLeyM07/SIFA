import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  Info,
  UploadCloud,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useSifa, formatZAR } from "@/lib/sifa/context";
import { computeInsights, type InsightTone } from "@/lib/sifa/insights";
import { getCoachRead, type CoachRead } from "@/lib/sifa/coach/coach.service";
import { TransactionSheet } from "@/components/sifa/transaction-sheet";
import type { Transaction } from "@/lib/sifa/types";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

const PIE_COLORS = ["#2F6F5E", "#1E4B3F", "#D89A3D", "#B45B47", "#7A7263", "#16231C"];

const TONE_ICON: Record<InsightTone, typeof Sparkles> = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  positive: TrendingUp,
  neutral: Info,
};

const TONE_COLOR: Record<InsightTone, string> = {
  critical: "text-brick",
  warning: "text-gold",
  positive: "text-emerald",
  neutral: "text-paper/40",
};

function DashboardPage() {
  const { transactions, bills, goals } = useSifa();
  const [openTx, setOpenTx] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [coach, setCoach] = useState<CoachRead | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);

  const stats = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthTx = transactions.filter((t) => t.date.slice(0, 7) === key);

    const income = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expenses = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const saved = income - expenses;
    const savedPct = income > 0 ? Math.round((saved / income) * 100) : 0;

    const byCat = new Map<string, number>();
    for (const t of monthTx) {
      if (t.type !== "expense") continue;
      byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount);
    }
    const pie = [...byCat.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name, value }));

    return { income, expenses, saved, savedPct, pie, count: monthTx.length };
  }, [transactions]);

  const insights = useMemo(
    () => computeInsights(transactions, bills, goals),
    [transactions, bills, goals],
  );

  // Sifa's written read. Cached against the underlying figures, so revisiting
  // this page is free — a call only fires when the numbers actually move.
  useEffect(() => {
    if (transactions.length < 3) return;
    let cancelled = false;
    setCoachLoading(true);
    getCoachRead(transactions, bills, goals)
      .then((result) => {
        if (!cancelled && result) setCoach(result.read);
      })
      .finally(() => {
        if (!cancelled) setCoachLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [transactions, bills, goals]);

  async function refreshCoach() {
    setCoachLoading(true);
    const result = await getCoachRead(transactions, bills, goals, { force: true });
    if (result) setCoach(result.read);
    setCoachLoading(false);
  }

  const upcomingBills = useMemo(
    () =>
      bills
        .filter((b) => b.status === "pending")
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 4),
    [bills],
  );

  // ── First run ──────────────────────────────────────────────
  if (transactions.length === 0) {
    return (
      <>
        <div className="mx-auto max-w-xl py-10 text-center sm:py-16">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald/10">
            <UploadCloud className="h-8 w-8 text-emerald" />
          </div>
          <h1 className="mt-6 font-display text-3xl font-semibold sm:text-4xl">
            Let's see where your money goes
          </h1>
          <p className="mt-3 text-muted">
            Drop in one bank statement. Sifa reads it, sorts every transaction into
            categories, and tells you what stands out — without you typing a thing.
          </p>

          <Link
            to="/import"
            className="mt-8 inline-flex min-h-[52px] items-center gap-2 rounded-full bg-emerald px-8 text-sm font-semibold text-paper transition hover:brightness-95 active:scale-[0.98]"
          >
            <UploadCloud className="h-4 w-4" /> Import a statement
          </Link>

          <p className="mt-4 text-xs text-muted">
            Reads in your browser · nothing uploaded · PDF or CSV
          </p>

          <div className="mt-10 border-t border-hair pt-6">
            <button
              onClick={() => {
                setEditing(null);
                setOpenTx(true);
              }}
              className="text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Or add a transaction by hand
            </button>
          </div>
        </div>

        <TransactionSheet open={openTx} onOpenChange={setOpenTx} editing={editing} />
      </>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sifa's read on the month */}
      <section className="relative overflow-hidden rounded-3xl border border-ink bg-ink p-6 text-paper sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-gold" />
            <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-paper/60">
              What Sifa noticed
            </h2>
          </div>
          <button
            onClick={refreshCoach}
            disabled={coachLoading}
            title="Refresh"
            className="rounded-full p-1.5 text-paper/40 transition hover:bg-paper/10 hover:text-paper disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${coachLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {coach ? (
          <>
            <p className="mt-4 font-display text-2xl font-semibold leading-snug sm:text-3xl">
              {coach.headline}
            </p>
            <p className="mt-3 leading-relaxed text-paper/70">{coach.body}</p>
            {coach.action && (
              <p className="mt-4 flex items-start gap-2 rounded-2xl bg-paper/5 p-4 text-sm text-paper/90">
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                {coach.action}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mt-4 font-display text-2xl font-semibold leading-snug">
              {coachLoading ? "Reading your month…" : "Here's what stands out"}
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              {insights.map((insight) => {
                const Icon = TONE_ICON[insight.tone];
                return (
                  <li key={insight.id} className="flex gap-2.5">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TONE_COLOR[insight.tone]}`} />
                    <div>
                      <p className="font-medium text-paper">{insight.title}</p>
                      <p className="mt-0.5 text-paper/60">{insight.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* The three numbers that matter */}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-3xl border border-hair bg-card p-5">
          <p className="text-xs font-medium uppercase tracking-widest text-muted">Came in</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-emerald">
            {formatZAR(stats.income)}
          </p>
        </div>
        <div className="rounded-3xl border border-hair bg-card p-5">
          <p className="text-xs font-medium uppercase tracking-widest text-muted">Went out</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-brick">
            {formatZAR(stats.expenses)}
          </p>
        </div>
        <div className="rounded-3xl border border-hair bg-card p-5">
          <p className="text-xs font-medium uppercase tracking-widest text-muted">Left over</p>
          <p
            className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${
              stats.saved >= 0 ? "text-ink" : "text-brick"
            }`}
          >
            {formatZAR(stats.saved)}
          </p>
          {stats.income > 0 && (
            <p className="mt-0.5 text-xs text-muted">{stats.savedPct}% of what came in</p>
          )}
        </div>
      </section>

      {/* Where it went + next bills */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-hair bg-card p-6">
          <h2 className="font-display text-xl font-semibold">Where it went</h2>
          {stats.pie.length === 0 ? (
            <p className="mt-6 text-sm text-muted">
              Nothing recorded this month yet.
            </p>
          ) : (
            <div className="mt-4 grid items-center gap-4 sm:grid-cols-[150px_1fr]">
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.pie}
                      dataKey="value"
                      innerRadius={38}
                      outerRadius={66}
                      paddingAngle={2}
                      stroke="none"
                    >
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
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="text-ink">{p.name}</span>
                    </span>
                    <span className="font-mono tabular-nums text-muted">
                      {formatZAR(p.value)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-hair bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Coming up</h2>
            <Link
              to="/bills"
              className="text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              All bills
            </Link>
          </div>
          {upcomingBills.length === 0 ? (
            <div className="mt-6">
              <p className="text-sm text-muted">No bills tracked yet.</p>
              <Link
                to="/bills"
                className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-hair bg-paper px-4 text-sm font-semibold transition hover:border-emerald"
              >
                <Plus className="h-4 w-4" /> Add a bill
              </Link>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-hair">
              {upcomingBills.map((b) => {
                const overdue = b.dueDate < new Date().toISOString().slice(0, 10);
                return (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{b.name}</p>
                      <p className={`text-xs ${overdue ? "text-brick" : "text-muted"}`}>
                        {overdue ? "Overdue · " : "Due "}
                        {b.dueDate}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-sm tabular-nums">
                      {formatZAR(b.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Quick add stays available, just not the headline act */}
      <div className="flex justify-center pt-2">
        <button
          onClick={() => {
            setEditing(null);
            setOpenTx(true);
          }}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-hair bg-card px-5 text-sm font-semibold text-ink transition hover:border-emerald"
        >
          <Plus className="h-4 w-4" /> Add a transaction
        </button>
      </div>

      <TransactionSheet open={openTx} onOpenChange={setOpenTx} editing={editing} />
    </div>
  );
}
