import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as transactionsService from "./services/transactions.service";
import * as goalsService from "./services/goals.service";
import * as billsService from "./services/bills.service";
import { makeId, storage } from "./storage";
import type { Goal, Transaction, Bill } from "./types";

interface SifaContextValue {
  hydrated: boolean;
  transactions: Transaction[];
  goals: Goal[];
  bills: Bill[];
  addTransaction: (t: Omit<Transaction, "id">) => void;
  addTransactions: (ts: Omit<Transaction, "id">[]) => void;
  updateTransaction: (t: Transaction) => void;
  deleteTransaction: (id: string) => void;
  addGoal: (g: Omit<Goal, "id">) => void;
  updateGoal: (g: Goal) => void;
  deleteGoal: (id: string) => void;
  addBill: (b: Omit<Bill, "id">) => void;
  updateBill: (b: Bill) => void;
  deleteBill: (id: string) => void;
  payBill: (id: string) => void;
  clearAllData: () => void;
}

const Ctx = createContext<SifaContextValue | null>(null);

/** Add one month to an ISO yyyy-mm-dd date, clamping to the last valid day
 * (so the 31st of a month doesn't roll over into the next-next month). */
function addOneMonthISO(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.toISOString().split("T")[0];
}

export function SifaProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);

  useEffect(() => {
    async function loadData() {
      setTransactions(await transactionsService.getTransactions());
      setGoals(await goalsService.getGoals());
      setBills(await billsService.getBills());
      setHydrated(true);
    }
    loadData();
  }, []);

  // ── Transactions ───────────────────────────────────────────
  const persistTx = useCallback((next: Transaction[]) => {
    setTransactions(next);
    transactionsService.saveTransactions(next);
  }, []);

  const addTransaction = useCallback(
    (t: Omit<Transaction, "id">) => persistTx([{ ...t, id: makeId() }, ...transactions]),
    [transactions, persistTx],
  );
  const addTransactions = useCallback(
    (ts: Omit<Transaction, "id">[]) => {
      const newTxs = ts.map((t) => ({ ...t, id: makeId() }));
      persistTx([...newTxs, ...transactions]);
    },
    [transactions, persistTx],
  );
  const updateTransaction = useCallback(
    (t: Transaction) => persistTx(transactions.map((x) => (x.id === t.id ? t : x))),
    [transactions, persistTx],
  );
  const deleteTransaction = useCallback(
    (id: string) => persistTx(transactions.filter((x) => x.id !== id)),
    [transactions, persistTx],
  );

  // ── Goals ──────────────────────────────────────────────────
  const persistGoals = useCallback((next: Goal[]) => {
    setGoals(next);
    goalsService.saveGoals(next);
  }, []);

  const addGoal = useCallback(
    (g: Omit<Goal, "id">) => persistGoals([...goals, { ...g, id: makeId() }]),
    [goals, persistGoals],
  );
  const updateGoal = useCallback(
    (g: Goal) => persistGoals(goals.map((x) => (x.id === g.id ? g : x))),
    [goals, persistGoals],
  );
  const deleteGoal = useCallback(
    (id: string) => persistGoals(goals.filter((x) => x.id !== id)),
    [goals, persistGoals],
  );

  // ── Bills ──────────────────────────────────────────────────
  const persistBills = useCallback((next: Bill[]) => {
    setBills(next);
    billsService.saveBills(next);
  }, []);

  const addBill = useCallback(
    (b: Omit<Bill, "id">) => persistBills([...bills, { ...b, id: makeId() }]),
    [bills, persistBills],
  );
  const updateBill = useCallback(
    (b: Bill) => persistBills(bills.map((x) => (x.id === b.id ? b : x))),
    [bills, persistBills],
  );
  const deleteBill = useCallback(
    (id: string) => persistBills(bills.filter((x) => x.id !== id)),
    [bills, persistBills],
  );
  const payBill = useCallback(
    (id: string) => {
      const existing = bills.find((x) => x.id === id);
      if (!existing) return;
      let next = bills.map((x) => (x.id === id ? { ...x, status: "paid" as const } : x));
      // A recurring bill spawns next month's pending occurrence when paid.
      if (existing.isRecurring) {
        next = [
          ...next,
          {
            ...existing,
            id: makeId(),
            status: "pending",
            dueDate: addOneMonthISO(existing.dueDate),
          },
        ];
      }
      persistBills(next);
    },
    [bills, persistBills],
  );

  const clearAllData = useCallback(() => {
    storage.clearAll();
    setTransactions([]);
    setGoals([]);
    setBills([]);
  }, []);

  const value = useMemo<SifaContextValue>(
    () => ({
      hydrated,
      transactions,
      goals,
      bills,
      addTransaction,
      addTransactions,
      updateTransaction,
      deleteTransaction,
      addGoal,
      updateGoal,
      deleteGoal,
      addBill,
      updateBill,
      deleteBill,
      payBill,
      clearAllData,
    }),
    [
      hydrated,
      transactions,
      goals,
      bills,
      addTransaction,
      addTransactions,
      updateTransaction,
      deleteTransaction,
      addGoal,
      updateGoal,
      deleteGoal,
      addBill,
      updateBill,
      deleteBill,
      payBill,
      clearAllData,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSifa() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSifa must be used inside <SifaProvider>");
  return c;
}

export function formatZAR(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}R ${abs.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
