import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSifa } from "@/lib/sifa/context";
import { suggestCategory } from "@/lib/sifa/categories";
import { Sparkles } from "lucide-react";
import { CATEGORIES, type Transaction, type TxnType } from "@/lib/sifa/types";

/** Values used to pre-fill a NEW transaction (from a recent-chip or Quick-Add).
 * Distinct from `editing`, which loads an existing row for update/delete. */
export type TransactionPrefill = Partial<Omit<Transaction, "id">>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Transaction | null;
  prefill?: TransactionPrefill | null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function TransactionSheet({ open, onOpenChange, editing, prefill }: Props) {
  const { addTransaction, updateTransaction, deleteTransaction } = useSifa();

  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TxnType>("expense");
  const [category, setCategory] = useState<string>("Other");
  const [customCategory, setCustomCategory] = useState("");

  useEffect(() => {
    if (open) {
      if (editing) {
        setDate(editing.date);
        setDescription(editing.description);
        setAmount(String(editing.amount));
        setType(editing.type);
        if (CATEGORIES.includes(editing.category as typeof CATEGORIES[number])) {
          setCategory(editing.category);
          setCustomCategory("");
        } else {
          setCategory("Other");
          setCustomCategory(editing.category);
        }
      } else {
        // New entry: start from prefill (recent chip / Quick-Add) or blank.
        setDate(prefill?.date ?? todayISO());
        setDescription(prefill?.description ?? "");
        setAmount(prefill?.amount != null ? String(prefill.amount) : "");
        setType(prefill?.type ?? "expense");
        const pc = prefill?.category;
        if (pc && CATEGORIES.includes(pc as typeof CATEGORIES[number])) {
          setCategory(pc);
          setCustomCategory("");
        } else if (pc) {
          setCategory("Other");
          setCustomCategory(pc);
        } else {
          setCategory("Other");
          setCustomCategory("");
        }
      }
    }
  }, [open, editing, prefill]);

  // Categorisation runs locally against the merchant dictionary and the user's
  // own learned corrections, so it resolves instantly — no spinner, no delay.
  const aiSuggestion = useMemo(() => suggestCategory(description), [description]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const num = Number(amount);
    if (!description.trim() || !Number.isFinite(num) || num <= 0) return;

    const finalCategory =
      category === "Other" && customCategory.trim() ? customCategory.trim() : category;

    const payload = {
      date,
      description: description.trim(),
      amount: num,
      type,
      category: finalCategory,
    };
    if (editing) updateTransaction({ ...editing, ...payload });
    else addTransaction(payload);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-paper text-ink">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {editing ? "Edit transaction" : "Add transaction"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setType("expense")}
              className={`min-h-[44px] rounded-full border px-4 text-sm font-medium transition ${
                type === "expense"
                  ? "bg-brick text-paper border-brick"
                  : "border-hair text-muted hover:text-ink"
              }`}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => setType("income")}
              className={`min-h-[44px] rounded-full border px-4 text-sm font-medium transition ${
                type === "income"
                  ? "bg-emerald text-paper border-emerald"
                  : "border-hair text-muted hover:text-ink"
              }`}
            >
              Income
            </button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tx-date">Date</Label>
            <Input
              id="tx-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-card"
            />
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
            {aiSuggestion && aiSuggestion !== category ? (
              <button
                type="button"
                onClick={() => setCategory(aiSuggestion)}
                className="flex items-center gap-1.5 text-xs text-emerald hover:underline"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Looks like {aiSuggestion} — tap to use</span>
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
            {category === "Other" && (
              <div className="pt-2">
                <Input
                  placeholder="Type a custom category..."
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  className="bg-card"
                  autoFocus
                />
              </div>
            )}
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
