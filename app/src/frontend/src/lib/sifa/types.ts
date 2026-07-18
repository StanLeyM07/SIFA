export type TxnType = "income" | "expense";

export interface Transaction {
  id: string;
  date: string; // ISO yyyy-mm-dd
  description: string;
  category: string;
  amount: number; // always positive; direction lives in `type`
  type: TxnType;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  current: number;
  monthlyContribution: number;
}

export type BillStatus = "pending" | "paid";

export interface Bill {
  id: string;
  name: string;
  amount: number;
  category: string;
  dueDate: string; // ISO yyyy-mm-dd
  status: BillStatus;
  isRecurring: boolean;
}

export const CATEGORIES = [
  "Groceries",
  "Transport",
  "Rent",
  "Utilities",
  "Airtime & data",
  "Subscriptions",
  "Eating out",
  "Entertainment",
  "Health",
  "Shopping",
  // Bank charges are a real, controllable expense — on a real SA statement
  // they were a third of all rows. Folding them into "Other" hid both the
  // spend and the fact that it's worth doing something about.
  "Bank fees",
  "Cash",
  "Transfers",
  "Salary",
  "Freelance",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * Categories that move money rather than earn or spend it.
 *
 * Moving R2 000 from a cheque account to savings is not income and not
 * spending — but it appears on the statement as both a debit and (if the
 * other account is imported too) a credit. Counting them inflates both sides
 * and wrecks every derived figure.
 *
 * On a real 3-month statement, R5 617 of R6 607 "income" was transfers. Real
 * income was R990. Every metric downstream — savings rate, what's left over,
 * the coach's read — was wrong by that margin.
 *
 * Cash withdrawals are deliberately NOT here: the money genuinely left the
 * account and gets spent in the real world, so treating it as spending is
 * the closest honest approximation available.
 */
export const MOVEMENT_CATEGORIES: ReadonlySet<string> = new Set(["Transfers"]);

/** True when a transaction shuffles money rather than earning or spending it. */
export function isMoneyMovement(category: string): boolean {
  return MOVEMENT_CATEGORIES.has(category);
}
