import type { Goal, License, Tier, Transaction } from "./types";

const K = {
  license: "sifa_license",
  transactions: "sifa_transactions",
  goals: "sifa_goals",
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
  } catch {
    /* noop */
  }
}

export const storage = {
  getLicense: (): License | null => safeGet<License | null>(K.license, null),
  setLicense: (l: License) => safeSet(K.license, l),
  clearLicense: () => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(K.license);
  },

  getTransactions: (): Transaction[] => safeGet<Transaction[]>(K.transactions, []),
  setTransactions: (t: Transaction[]) => safeSet(K.transactions, t),

  getGoals: (): Goal[] => safeGet<Goal[]>(K.goals, []),
  setGoals: (g: Goal[]) => safeSet(K.goals, g),
};

/**
 * Mock license activation. Accepts any non-empty key. Tier inferred from prefix.
 *
 * TODO: replace with real verification via Supabase edge function calling
 * Gumroad's license API. Should return { valid, tier } from a server call
 * that: verifies the key with Gumroad, records device fingerprint, enforces
 * per-tier device limits, and rejects revoked keys.
 */
export function activateLicense(rawKey: string): License | null {
  const key = rawKey.trim().toUpperCase();
  if (!key) return null;
  let tier: Tier = "starter";
  if (key.startsWith("PRO")) tier = "pro";
  else if (key.startsWith("BIZ")) tier = "business";
  else if (key.startsWith("STR")) tier = "starter";
  const license: License = { key, tier, activatedAt: new Date().toISOString() };
  storage.setLicense(license);
  return license;
}

export function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
