import { storage } from "../storage";
import type { Bill } from "../types";

export async function getBills(): Promise<Bill[]> {
  return storage.getBills();
}

export async function saveBills(bills: Bill[]): Promise<void> {
  storage.setBills(bills);
}
