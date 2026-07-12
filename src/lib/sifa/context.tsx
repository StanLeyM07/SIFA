import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { activateLicense as doActivate, makeId, storage } from "./storage";
import type { Goal, License, Transaction } from "./types";
import { FEATURES } from "./types";

interface SifaContextValue {
  hydrated: boolean;
  license: License | null;
  transactions: Transaction[];
  goals: Goal[];
  activate: (key: string) => License | null;
  deactivate: () => void;
  addTransaction: (t: Omit<Transaction, "id">) => void;
  updateTransaction: (t: Transaction) => void;
  deleteTransaction: (id: string) => void;
  addGoal: (g: Omit<Goal, "id">) => { ok: boolean; reason?: string };
  updateGoal: (g: Goal) => void;
  deleteGoal: (id: string) => void;
  features: (typeof FEATURES)[keyof typeof FEATURES];
}

const Ctx = createContext<SifaContextValue | null>(null);

export function SifaProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [license, setLicense] = useState<License | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  useEffect(() => {
    setLicense(storage.getLicense());
    setTransactions(storage.getTransactions());
    setGoals(storage.getGoals());
    setHydrated(true);
  }, []);

  const activate = useCallback((key: string) => {
    const l = doActivate(key);
    if (l) setLicense(l);
    return l;
  }, []);

  const deactivate = useCallback(() => {
    storage.clearLicense();
    setLicense(null);
  }, []);

  const persistTx = useCallback((next: Transaction[]) => {
    setTransactions(next);
    storage.setTransactions(next);
  }, []);

  const addTransaction = useCallback(
    (t: Omit<Transaction, "id">) => persistTx([{ ...t, id: makeId() }, ...transactions]),
    [transactions, persistTx]
  );
  const updateTransaction = useCallback(
    (t: Transaction) => persistTx(transactions.map((x) => (x.id === t.id ? t : x))),
    [transactions, persistTx]
  );
  const deleteTransaction = useCallback(
    (id: string) => persistTx(transactions.filter((x) => x.id !== id)),
    [transactions, persistTx]
  );

  const persistGoals = useCallback((next: Goal[]) => {
    setGoals(next);
    storage.setGoals(next);
  }, []);

  const tier = license?.tier ?? "starter";
  const features = FEATURES[tier];

  const addGoal = useCallback(
    (g: Omit<Goal, "id">) => {
      if (!features.unlimitedGoals && goals.length >= 1) {
        return { ok: false, reason: "Starter includes 1 goal — Upgrade for unlimited" };
      }
      persistGoals([...goals, { ...g, id: makeId() }]);
      return { ok: true };
    },
    [goals, features.unlimitedGoals, persistGoals]
  );
  const updateGoal = useCallback((g: Goal) => persistGoals(goals.map((x) => (x.id === g.id ? g : x))), [goals, persistGoals]);
  const deleteGoal = useCallback((id: string) => persistGoals(goals.filter((x) => x.id !== id)), [goals, persistGoals]);

  const value = useMemo<SifaContextValue>(
    () => ({
      hydrated,
      license,
      transactions,
      goals,
      activate,
      deactivate,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      addGoal,
      updateGoal,
      deleteGoal,
      features,
    }),
    [hydrated, license, transactions, goals, activate, deactivate, addTransaction, updateTransaction, deleteTransaction, addGoal, updateGoal, deleteGoal, features]
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
