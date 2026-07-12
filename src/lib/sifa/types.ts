export type Tier = "starter" | "pro" | "business";

export type TxnType = "income" | "expense";

export interface Transaction {
  id: string;
  date: string; // ISO yyyy-mm-dd
  description: string;
  category: string;
  amount: number; // positive number
  type: TxnType;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  current: number;
  monthlyContribution: number;
}

export interface License {
  key: string;
  tier: Tier;
  activatedAt: string; // ISO
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

export const FEATURES: Record<Tier, { aiInsights: boolean; askSifa: boolean; unlimitedGoals: boolean; profiles: boolean; export: boolean; deviceLimit: number; label: string }> = {
  starter: { aiInsights: false, askSifa: false, unlimitedGoals: false, profiles: false, export: false, deviceLimit: 1, label: "Starter" },
  pro: { aiInsights: true, askSifa: true, unlimitedGoals: true, profiles: false, export: false, deviceLimit: 2, label: "Pro" },
  business: { aiInsights: true, askSifa: true, unlimitedGoals: true, profiles: true, export: true, deviceLimit: 2, label: "Business" },
};
