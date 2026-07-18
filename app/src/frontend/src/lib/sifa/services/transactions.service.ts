import { storage } from "../storage";
import type { Transaction } from "../types";

export async function getTransactions(): Promise<Transaction[]> {
  return storage.getTransactions();
}

export async function saveTransactions(txns: Transaction[]): Promise<void> {
  storage.setTransactions(txns);
}
