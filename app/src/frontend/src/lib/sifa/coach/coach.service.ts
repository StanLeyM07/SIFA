import { buildFactSheet, factsFingerprint, type FactSheet } from "./facts";
import type { Bill, Goal, Transaction } from "../types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const CACHE_KEY = "sifa_coach_cache";

/**
 * Bump when the fact sheet shape or the coach prompt changes. Without this a
 * response cached by an older build is served forever — which is how a
 * hallucinated figure survived the fix that was supposed to prevent it.
 */
const COACH_VERSION = 2;

/** Even a valid read goes stale; a month-old summary shouldn't look current. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface CoachRead {
  headline: string;
  body: string;
  action: string;
}

interface CachedCoach extends CoachRead {
  fingerprint: string;
  at: string;
  version?: number;
}

function readCache(): CachedCoach | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedCoach) : null;
  } catch {
    return null;
  }
}

function writeCache(entry: CachedCoach) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // A full quota shouldn't break the dashboard.
  }
}

export function clearCoachCache() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CACHE_KEY);
}

/**
 * Get Sifa's read on the current month.
 *
 * The response is cached against a fingerprint of the underlying figures, so
 * revisiting the dashboard costs nothing — a call only happens when the
 * numbers have actually changed. That is what keeps this affordable to run
 * for free while people are testing.
 *
 * Only aggregates are sent (see facts.ts); no transactions, merchants, or
 * anything identifying leaves the browser.
 */
export async function getCoachRead(
  transactions: Transaction[],
  bills: Bill[],
  goals: Goal[],
  options: { force?: boolean } = {},
): Promise<{ read: CoachRead; cached: boolean } | null> {
  const facts = buildFactSheet(transactions, bills, goals);
  const fingerprint = factsFingerprint(facts);

  if (!options.force) {
    const cached = readCache();
    const fresh =
      cached &&
      cached.version === COACH_VERSION &&
      cached.fingerprint === fingerprint &&
      Date.now() - new Date(cached.at).getTime() < MAX_AGE_MS;

    if (fresh) {
      return {
        read: { headline: cached.headline, body: cached.body, action: cached.action },
        cached: true,
      };
    }
  }

  try {
    const res = await fetch(`${API_URL}/api/coach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facts } satisfies { facts: FactSheet }),
    });

    if (!res.ok) return null;

    const read = (await res.json()) as CoachRead;
    if (!read?.headline || !read?.body) return null;

    writeCache({
      ...read,
      fingerprint,
      at: new Date().toISOString(),
      version: COACH_VERSION,
    });
    return { read, cached: false };
  } catch {
    // The dashboard's computed insights still stand on their own.
    return null;
  }
}
