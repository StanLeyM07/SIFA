import { storage } from "../storage";
import type { Goal } from "../types";

export async function getGoals(): Promise<Goal[]> {
  return storage.getGoals();
}

export async function saveGoals(goals: Goal[]): Promise<void> {
  storage.setGoals(goals);
}
