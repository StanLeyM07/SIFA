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
