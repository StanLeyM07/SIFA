import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, Pencil, CheckCircle2, Circle } from "lucide-react";
import { useSifa, formatZAR } from "@/lib/sifa/context";
import { CATEGORIES } from "@/lib/sifa/types";

export const Route = createFileRoute("/_app/bills")({
  component: BillsPage,
});

function BillsPage() {
  const { bills, addBill, updateBill, deleteBill, payBill, addTransaction } = useSifa();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[3]); // Default to Utilities
  const [dueDate, setDueDate] = useState("");
  const [isRecurring, setIsRecurring] = useState(true);
  const [showAllPast, setShowAllPast] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [payingIds, setPayingIds] = useState<string[]>([]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const amt = Number(amount);
    if (!name.trim() || !Number.isFinite(amt) || amt <= 0 || !dueDate) {
      setErr("Fill in name, amount, and due date.");
      return;
    }
    if (editingId) {
      const existing = bills.find((b) => b.id === editingId);
      if (existing) {
        updateBill({ ...existing, name: name.trim(), amount: amt, category, dueDate, isRecurring });
      }
    } else {
      const result = addBill({
        name: name.trim(),
        amount: amt,
        category,
        dueDate,
        status: "pending",
        isRecurring,
      });
    }
    setName("");
    setAmount("");
    setCategory(CATEGORIES[3]);
    setDueDate("");
    setIsRecurring(true);
    setEditingId(null);
    setOpen(false);
  }

  function handlePayBill(id: string) {
    if (payingIds.includes(id)) return;
    const bill = bills.find((b) => b.id === id);
    if (!bill) return;

    // Trigger visual animation first
    setPayingIds((prev) => [...prev, id]);

    // Perform actual data update after a satisfying delay
    setTimeout(() => {
      payBill(id);
      addTransaction({
        date: bill.dueDate,
        description: `Paid: ${bill.name}`,
        category: bill.category,
        amount: bill.amount,
        type: "expense",
      });
      setPayingIds((prev) => prev.filter((x) => x !== id));
    }, 600);
  }

  const pendingBills = bills
    .filter((b) => b.status === "pending")
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const paidBills = bills
    .filter((b) => b.status === "paid")
    .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
  const displayedPaidBills = showAllPast ? paidBills : paidBills.slice(0, 5);

  const renderTable = (items: typeof bills, isPast: boolean) => {
    if (items.length === 0) {
      if (!isPast)
        return (
          <div className="p-8 text-center text-sm text-muted bg-card rounded-3xl border border-hair">
            No pending bills.
          </div>
        );
      return null;
    }
    return (
      <div
        className={`rounded-3xl border border-hair bg-card overflow-hidden ${isPast ? "opacity-70 grayscale-[30%]" : ""}`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-hair">
                <th className="p-4 font-semibold uppercase tracking-widest text-muted text-xs">
                  Status
                </th>
                <th className="p-4 font-semibold uppercase tracking-widest text-muted text-xs">
                  Bill Name
                </th>
                <th className="p-4 font-semibold uppercase tracking-widest text-muted text-xs">
                  Category
                </th>
                <th className="p-4 font-semibold uppercase tracking-widest text-muted text-xs text-right">
                  Amount (R)
                </th>
                <th className="p-4 font-semibold uppercase tracking-widest text-muted text-xs text-right">
                  Due Date
                </th>
                <th className="p-4 font-semibold uppercase tracking-widest text-muted text-xs text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair">
              {items.map((b) => {
                const isPaying = payingIds.includes(b.id);
                return (
                  <tr
                    key={b.id}
                    className={`hover:bg-paper/50 transition-all duration-500 ${isPaying ? "opacity-50" : ""}`}
                  >
                    <td className="p-4">
                      {b.status === "paid" || isPaying ? (
                        <div className="flex items-center gap-2 text-emerald animate-in zoom-in duration-300">
                          <CheckCircle2 className="h-5 w-5" />
                          <span className="font-medium">Paid</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handlePayBill(b.id)}
                          className="flex items-center gap-2 text-brick hover:text-emerald transition-colors"
                          title="Mark as Paid"
                        >
                          <Circle className="h-5 w-5" />
                          <span className="font-medium">Pending</span>
                        </button>
                      )}
                    </td>
                    <td
                      className={`p-4 font-display font-medium transition-all duration-500 ${b.status === "paid" || isPaying ? "text-muted line-through" : "text-ink"}`}
                    >
                      {b.name}
                      {b.isRecurring && (
                        <span className="ml-2 inline-block rounded bg-paper px-1.5 py-0.5 text-[10px] font-semibold text-muted border border-hair uppercase tracking-widest no-underline">
                          Monthly
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-muted">{b.category}</td>
                    <td className="p-4 text-right font-mono tabular-nums">{formatZAR(b.amount)}</td>
                    <td className="p-4 text-right tabular-nums text-muted">
                      {new Date(b.dueDate).toLocaleDateString("en-ZA", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditingId(b.id);
                            setName(b.name);
                            setAmount(String(b.amount));
                            setCategory(b.category);
                            setDueDate(b.dueDate);
                            setIsRecurring(b.isRecurring);
                            setOpen(true);
                          }}
                          className="rounded-full p-2 text-muted hover:text-ink"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteBill(b.id)}
                          className="rounded-full p-2 text-muted hover:text-brick"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Bills</h1>
          <p className="mt-1 text-sm text-muted">
            What's due, what's paid, and what's coming.
          </p>
        </div>
        <button
          onClick={() => {
            setName("");
            setAmount("");
            setCategory(CATEGORIES[3]);
            setDueDate("");
            setIsRecurring(true);
            setEditingId(null);
            setOpen((o) => !o);
          }}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-ink px-5 text-sm font-semibold text-paper hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add a bill
        </button>
      </header>

      {open ? (
        <form
          onSubmit={submit}
          className="rounded-3xl border border-hair bg-card p-5 sm:p-6 space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted">
                Bill Name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Electricity"
                className="min-h-[44px] w-full rounded-full border border-hair bg-paper px-4 text-sm focus:outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted">
                Amount (R)
              </span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                className="min-h-[44px] w-full rounded-full border border-hair bg-paper px-4 font-mono text-sm tabular-nums focus:outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted">
                Category
              </span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="min-h-[44px] w-full rounded-full border border-hair bg-paper px-4 text-sm focus:outline-none appearance-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted">
                Due Date
              </span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="min-h-[44px] w-full rounded-full border border-hair bg-paper px-4 text-sm focus:outline-none"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 px-1 pt-2 cursor-pointer w-max">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              className="h-4 w-4 rounded border-hair text-emerald focus:ring-emerald"
            />
            <span className="text-sm font-medium text-ink">Repeats monthly</span>
          </label>
          {err ? <p className="text-sm text-brick">{err}</p> : null}
          <div className="flex justify-end gap-2 mt-4">
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
              Save bill
            </button>
          </div>
        </form>
      ) : null}

      {bills.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-hair bg-card p-8 text-center text-sm text-muted">
          No bills yet. Add your upcoming subscriptions or utilities here.
        </p>
      ) : (
        <div className="space-y-8">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted mb-3 px-2">
              Upcoming Bills
            </h2>
            {renderTable(pendingBills, false)}
          </div>

          {paidBills.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3 px-2">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
                  Past Bills
                </h2>
                {paidBills.length > 5 && (
                  <button
                    onClick={() => setShowAllPast((p) => !p)}
                    className="text-xs font-semibold text-emerald hover:text-emerald/80 transition-colors uppercase tracking-widest"
                  >
                    {showAllPast ? "Show less" : `View all (${paidBills.length})`}
                  </button>
                )}
              </div>
              {renderTable(displayedPaidBills, true)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
