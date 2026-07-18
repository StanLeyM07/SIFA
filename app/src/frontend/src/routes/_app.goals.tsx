import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useSifa, formatZAR } from "@/lib/sifa/context";

export const Route = createFileRoute("/_app/goals")({
  component: GoalsPage,
});

function monthsFromNow(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

function GoalsPage() {
  const { goals, addGoal, updateGoal, deleteGoal } = useSifa();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [monthly, setMonthly] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const t = Number(target),
      c = Number(current),
      m = Number(monthly);
    if (!name.trim() || !Number.isFinite(t) || t <= 0 || !Number.isFinite(m) || m <= 0) {
      setErr("Fill in name, target, and monthly contribution.");
      return;
    }
    if (editingId) {
      updateGoal({
        id: editingId,
        name: name.trim(),
        target: t,
        current: Number.isFinite(c) ? c : 0,
        monthlyContribution: m,
      });
    } else {
      const result = addGoal({
        name: name.trim(),
        target: t,
        current: Number.isFinite(c) ? c : 0,
        monthlyContribution: m,
      });
    }
    setName("");
    setTarget("");
    setCurrent("");
    setMonthly("");
    setEditingId(null);
    setOpen(false);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Goals</h1>
          <p className="mt-1 text-sm text-muted">
            What you're saving towards, and when you'll get there.
          </p>
        </div>
        <button
          onClick={() => {
            setName("");
            setTarget("");
            setCurrent("");
            setMonthly("");
            setEditingId(null);
            setOpen((o) => !o);
          }}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-ink px-5 text-sm font-semibold text-paper hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add a goal
        </button>
      </header>

      {open ? (
        <form
          onSubmit={submit}
          className="rounded-3xl border border-hair bg-card p-5 sm:p-6 space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted">
                Name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Emergency fund"
                className="min-h-[44px] w-full rounded-full border border-hair bg-paper px-4 text-sm focus:outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted">
                Target (R)
              </span>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                className="min-h-[44px] w-full rounded-full border border-hair bg-paper px-4 font-mono text-sm tabular-nums focus:outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted">
                Already saved (R)
              </span>
              <input
                value={current}
                onChange={(e) => setCurrent(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                className="min-h-[44px] w-full rounded-full border border-hair bg-paper px-4 font-mono text-sm tabular-nums focus:outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted">
                Monthly (R)
              </span>
              <input
                value={monthly}
                onChange={(e) => setMonthly(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                className="min-h-[44px] w-full rounded-full border border-hair bg-paper px-4 font-mono text-sm tabular-nums focus:outline-none"
              />
            </label>
          </div>
          {err ? <p className="text-sm text-brick">{err}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setEditingId(null);
              }}
              className="min-h-[44px] rounded-full px-4 text-sm text-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[44px] rounded-full bg-emerald px-5 text-sm font-semibold text-paper hover:brightness-95"
            >
              Save goal
            </button>
          </div>
        </form>
      ) : null}

      {goals.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-hair bg-card p-8 text-center text-sm text-muted">
          No goals yet. Add one — a target, a monthly amount, and Sifa handles the maths.
        </p>
      ) : (
        <ul className="space-y-3">
          {goals.map((g) => {
            const current = Number.isFinite(g.current) ? g.current : 0;
            const target = Number.isFinite(g.target) ? g.target : 1;
            const pct = Math.min(100, Math.max(0, (current / target) * 100));
            const remaining = Math.max(0, target - current);
            const mContrib =
              Number.isFinite(g.monthlyContribution) && g.monthlyContribution > 0
                ? g.monthlyContribution
                : 0;
            let monthsLeft = mContrib > 0 ? Math.ceil(remaining / mContrib) : Infinity;
            if (Number.isNaN(monthsLeft)) monthsLeft = Infinity;
            return (
              <li key={g.id} className="rounded-3xl border border-hair bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg font-semibold">{g.name}</p>
                    <p className="mt-0.5 font-mono text-sm tabular-nums text-muted">
                      {formatZAR(g.current)} / {formatZAR(g.target)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingId(g.id);
                        setName(g.name);
                        setTarget(String(g.target));
                        setCurrent(String(g.current));
                        setMonthly(String(g.monthlyContribution));
                        setOpen(true);
                      }}
                      aria-label={`Edit ${g.name}`}
                      className="rounded-full p-2 text-muted hover:text-ink"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deleteGoal(g.id)}
                      aria-label={`Delete ${g.name}`}
                      className="rounded-full p-2 text-muted hover:text-brick"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-hair">
                  <div
                    className={`h-full rounded-full transition-colors ${pct < 25 ? "bg-brick" : pct < 75 ? "bg-gold" : "bg-emerald"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted">
                  {monthsLeft === Infinity
                    ? "Set a monthly contribution to see the on-track date."
                    : `On track by ${monthsFromNow(monthsLeft)}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
