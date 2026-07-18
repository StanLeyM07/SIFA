import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useSifa, formatZAR } from "@/lib/sifa/context";
import { TransactionSheet, type TransactionPrefill } from "@/components/sifa/transaction-sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { parseQuickAdd } from "@/lib/sifa/categories";
import { displayName } from "@/lib/sifa/categorize/engine";
import type { Transaction } from "@/lib/sifa/types";

/** A recurring vendor+category+amount+type combo, surfaced as a one-tap chip. */
interface FrequentCombo {
  key: string;
  description: string;
  category: string;
  amount: number;
  type: Transaction["type"];
  count: number;
}

/** Derive the most-logged transaction combos so repeats are one tap away.
 * Grouped by type + normalised description + category + amount; ranked by
 * frequency, then recency as a tiebreak. */
function frequentCombos(transactions: Transaction[], limit = 6): FrequentCombo[] {
  const groups = new Map<string, FrequentCombo & { lastDate: string }>();
  for (const t of transactions) {
    const desc = t.description.trim();
    if (!desc) continue;
    const key = `${t.type}|${desc.toLowerCase()}|${t.category}|${t.amount}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (t.date > existing.lastDate) existing.lastDate = t.date;
    } else {
      groups.set(key, {
        key,
        description: desc,
        category: t.category,
        amount: t.amount,
        type: t.type,
        count: 1,
        lastDate: t.date,
      });
    }
  }
  return Array.from(groups.values())
    .sort((a, b) =>
      b.count !== a.count ? b.count - a.count : b.lastDate.localeCompare(a.lastDate),
    )
    .slice(0, limit);
}

interface TransactionsSearch {
  add?: boolean;
}

export const Route = createFileRoute("/_app/transactions")({
  validateSearch: (search: Record<string, unknown>): TransactionsSearch => {
    // The PWA shortcut sends ?add=1; TanStack may parse it as the number 1,
    // the string "1", or a boolean. Only keep the flag when truthy so the URL
    // stays clean (no ?add=false) otherwise.
    const raw = search.add;
    const add = raw === 1 || raw === "1" || raw === true || raw === "true";
    return add ? { add: true } : {};
  },
  component: TransactionsPage,
});

function TransactionsPage() {
  const { transactions } = useSifa();
  const navigate = useNavigate();
  const { add } = Route.useSearch();
  const [openTx, setOpenTx] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [prefill, setPrefill] = useState<TransactionPrefill | null>(null);
  const [showAllTx, setShowAllTx] = useState(false);

  // PWA "Add Expense" shortcut lands here with ?add=1 — open a fresh sheet, then
  // strip the param so a refresh or back-nav doesn't reopen it.
  useEffect(() => {
    if (add) {
      setEditing(null);
      setPrefill(null);
      setOpenTx(true);
      navigate({ to: "/transactions", search: {}, replace: true });
    }
  }, [add, navigate]);

  const chips = useMemo(() => frequentCombos(transactions), [transactions]);

  const [quickAdd, setQuickAdd] = useState("");
  const quickAddParsed = useMemo(() => parseQuickAdd(quickAdd), [quickAdd]);

  function openChip(combo: FrequentCombo) {
    setEditing(null);
    setPrefill({
      description: combo.description,
      category: combo.category,
      amount: combo.amount,
      type: combo.type,
    });
    setOpenTx(true);
  }

  function submitQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!quickAddParsed) return;
    setEditing(null);
    setPrefill(quickAddParsed);
    setOpenTx(true);
    setQuickAdd("");
  }

  // Derive available months from transactions
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    for (const t of transactions) {
      const d = new Date(t.date);
      const m = d.getMonth();
      const y = d.getFullYear();
      months.add(`${y}-${m}`);
    }
    const currentD = new Date();
    months.add(`${currentD.getFullYear()}-${currentD.getMonth()}`);

    // Sort descending
    return Array.from(months).sort((a, b) => {
      const [yA, mA] = a.split("-").map(Number);
      const [yB, mB] = b.split("-").map(Number);
      if (yA !== yB) return yB - yA;
      return mB - mA;
    });
  }, [transactions]);

  const [selectedMonthStr, setSelectedMonthStr] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}`;
  });

  const filteredTransactions = useMemo(() => {
    const [yStr, mStr] = selectedMonthStr.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    return transactions.filter((t) => {
      const d = new Date(t.date);
      return d.getFullYear() === y && d.getMonth() === m;
    });
  }, [transactions, selectedMonthStr]);

  const formatMonthLabel = (mStr: string) => {
    const [y, m] = mStr.split("-").map(Number);
    const d = new Date(y, m, 1);
    return d.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Transactions</h1>
          <p className="mt-1 text-sm text-muted">All your logged income and expenses.</p>
        </div>
        <Link
          to="/import"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-hair bg-card px-4 text-sm font-semibold text-ink transition hover:border-emerald focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald active:scale-[0.98]"
        >
          Import
        </Link>
      </header>

      <section aria-label="Quick add" className="space-y-2">
        <form onSubmit={submitQuickAdd} className="flex gap-2">
          <Input
            value={quickAdd}
            onChange={(e) => setQuickAdd(e.target.value)}
            placeholder="Quick add — e.g. “coffee 35” or “150 groceries”"
            aria-label="Quick add a transaction"
            className="bg-card"
          />
          <button
            type="submit"
            disabled={!quickAddParsed}
            className="min-h-[44px] shrink-0 rounded-full bg-ink px-5 text-sm font-semibold text-paper transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add
          </button>
        </form>
        {quickAdd.trim() && quickAddParsed && (
          <p className="pl-1 text-xs text-muted">
            {formatZAR(quickAddParsed.amount)} · {quickAddParsed.category} ·{" "}
            {quickAddParsed.description} — review before saving
          </p>
        )}
        {quickAdd.trim() && !quickAddParsed && (
          <p className="pl-1 text-xs text-brick">Add an amount, e.g. “coffee 35”.</p>
        )}
      </section>

      {chips.length > 0 && (
        <section aria-label="Quick add from recent" className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Log again</p>
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <button
                key={c.key}
                onClick={() => openChip(c)}
                className="group inline-flex min-h-[44px] items-center gap-2 rounded-full border border-hair bg-card px-4 text-sm text-ink transition hover:border-emerald hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald active:scale-[0.98]"
              >
                <span className="max-w-[10rem] truncate font-medium" title={c.description}>
                  {displayName(c.description)}
                </span>
                <span
                  className={`font-mono tabular-nums text-xs ${c.type === "expense" ? "text-brick" : "text-emerald"}`}
                >
                  {c.type === "expense" ? "-" : "+"}
                  {formatZAR(c.amount).replace("-", "")}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-hair bg-card p-6">
        <div className="mb-6 max-w-xs">
          <Select value={selectedMonthStr} onValueChange={(val) => { setSelectedMonthStr(val); setShowAllTx(false); }}>
            <SelectTrigger className="bg-paper">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {availableMonths.map((m) => (
                <SelectItem key={m} value={m}>
                  {formatMonthLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filteredTransactions.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No transactions for this month.</p>
        ) : (
          <>
            <ul className="divide-y divide-dashed divide-hair">
              {(showAllTx ? filteredTransactions : filteredTransactions.slice(0, 5)).map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => {
                      setPrefill(null);
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
            {!showAllTx && filteredTransactions.length > 5 && (
              <button
                onClick={() => setShowAllTx(true)}
                className="mt-3 block w-full text-center text-sm font-semibold text-emerald hover:brightness-95"
              >
                View all ({filteredTransactions.length}) →
              </button>
            )}
          </>
        )}
      </section>

      <TransactionSheet
        open={openTx}
        onOpenChange={setOpenTx}
        editing={editing}
        prefill={prefill}
      />
    </div>
  );
}
