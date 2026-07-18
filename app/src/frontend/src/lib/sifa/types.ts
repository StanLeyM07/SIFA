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
  "Subscriptions",
  "Eating out",
  "Entertainment",
  "Health",
  "Shopping",
  "Salary",
  "Freelance",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];
