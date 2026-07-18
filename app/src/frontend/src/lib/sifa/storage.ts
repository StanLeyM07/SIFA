import type { Goal, Transaction, Bill } from "./types";

export class StorageFullError extends Error {
  constructor(
    message = "Your browser storage is full. Export your data to free up space.",
  ) {
    super(message);
    this.name = "StorageFullError";
  }
}

const K = {
  transactions: "sifa_transactions",
  goals: "sifa_goals",
  bills: "sifa_bills",
  merchantRules: "sifa_merchant_rules",
  onboarded: "sifa_onboarded",
} as const;

function safeGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      throw new StorageFullError();
    }
  }
}

export const storage = {
  // Getters default to empty so a new user starts on the onboarding empty
  // state rather than staring at someone else's fake numbers.
  getTransactions: (): Transaction[] => safeGet<Transaction[]>(K.transactions, []),
  setTransactions: (t: Transaction[]) => safeSet(K.transactions, t),

  getGoals: (): Goal[] => safeGet<Goal[]>(K.goals, []),
  setGoals: (g: Goal[]) => safeSet(K.goals, g),

  getBills: (): Bill[] => safeGet<Bill[]>(K.bills, []),
  setBills: (b: Bill[]) => safeSet(K.bills, b),

  // Learned merchant -> category map, built from the user's own import
  // corrections. Keyed by normalised description (see categorize/normalize.ts).
  getMerchantRules: (): Record<string, string> =>
    safeGet<Record<string, string>>(K.merchantRules, {}),
  setMerchantRules: (r: Record<string, string>) => safeSet(K.merchantRules, r),

  hasOnboarded: (): boolean => safeGet<boolean>(K.onboarded, false),
  setOnboarded: (v: boolean) => safeSet(K.onboarded, v),

  clearAll: () => {
    if (typeof window === "undefined") return;
    for (const key of Object.values(K)) window.localStorage.removeItem(key);
  },
};

export function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
