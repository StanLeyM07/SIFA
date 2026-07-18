import { computeInsights, type Insight } from "../insights";
import type { Bill, Goal, Transaction } from "../types";

/**
 * Insights are computed locally from the user's own data — no network call,
 * no LLM, no tokens. Kept behind the service layer so callers don't need to
 * care where the numbers come from.
 */
export async function getInsights(
  transactions: Transaction[],
  bills: Bill[] = [],
  goals: Goal[] = [],
): Promise<Insight[]> {
  return computeInsights(transactions, bills, goals);
}

export type { Insight };
