import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSifa } from "@/lib/sifa/context";
import { suggestCategory } from "@/lib/sifa/categories";
import { CATEGORIES, type Transaction, type TxnType } from "@/lib/sifa/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Transaction | null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function TransactionSheet({ open, onOpenChange, editing }: Props) {
  const { addTransaction, updateTransaction, deleteTransaction } = useSifa();

  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TxnType>("expense");
  const [category, setCategory] = useState<string>("Other");

  useEffect(() => {
    if (open) {
      if (editing) {
        setDate(editing.date);
        setDescription(editing.description);
        setAmount(String(editing.amount));
        setType(editing.type);
        setCategory(editing.category);
      } else {
        setDate(todayISO());
        setDescription("");
        setAmount("");
        setType("expense");
        setCategory("Other");
      }
    }
  }, [open, editing]);

  const suggested = suggestCategory(description);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const num = Number(amount);
    if (!description.trim() || !Number.isFinite(num) || num <= 0) return;
    const payload = {
      date,
      description: description.trim(),
      amount: num,
      type,
      category,
    };
    if (editing) updateTransaction({ ...editing, ...payload });
    else addTransaction(payload);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-paper text-ink">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{editing ? "Edit transaction" : "Add transaction"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setType("expense")}
              className={`min-h-[44px] rounded-full border px-4 text-sm font-medium transition ${
                type === "expense" ? "bg-brick text-paper border-brick" : "border-hair text-muted hover:text-ink"
              }`}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => setType("income")}
              className={`min-h-[44px] rounded-full border px-4 text-sm font-medium transition ${
                type === "income" ? "bg-emerald text-paper border-emerald" : "border-hair text-muted hover:text-ink"
              }`}
            >
              Income
            </button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tx-date">Date</Label>
            <Input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-card" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tx-desc">Description</Label>
            <Input
              id="tx-desc"
              placeholder="Woolworths, Uber, rent…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-card"
              autoFocus
            />
            {suggested && suggested !== category ? (
              <button
                type="button"
                onClick={() => setCategory(suggested)}
                className="text-xs text-emerald hover:underline"
              >
                Suggested: {suggested} — tap to use
              </button>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tx-amount">Amount (R)</Label>
            <Input
              id="tx-amount"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              className="bg-card font-mono tabular-nums text-lg"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            {editing ? (
              <button
                type="button"
                onClick={() => {
                  deleteTransaction(editing.id);
                  onOpenChange(false);
                }}
                className="min-h-[44px] rounded-full px-4 text-sm font-medium text-brick hover:underline"
              >
                Delete
              </button>
            ) : (
              <span />
            )}
            <button
              type="submit"
              className="min-h-[44px] w-full rounded-full bg-ink px-6 text-sm font-semibold text-paper transition hover:opacity-90 sm:w-auto"
            >
              Save
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
