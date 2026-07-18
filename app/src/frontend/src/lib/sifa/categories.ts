import { categorizeOne } from "./categorize/engine";
import { storage } from "./storage";
import type { CorrectionMap } from "./categorize/engine";

/**
 * Category suggestion for manually-entered transactions.
 *
 * Delegates to the same engine the importer uses, so a merchant the user
 * corrected during an import is recognised when they type it in by hand too.
 */
export function suggestCategory(description: string): string | null {
  const d = description.trim();
  if (!d) return null;
  const match = categorizeOne(d, 0, storage.getMerchantRules() as CorrectionMap);
  return match.source === "none" ? null : match.category;
}

export interface QuickAddResult {
  description: string;
  amount: number;
  category: string;
  type: "expense";
}

/** Parse a free-text Quick-Add string like "coffee 35" or "150 groceries" into
 * a draft expense. The first number is the amount; the rest is the vendor,
 * which also drives the category guess. Returns null if there's no usable
 * amount, so the caller can keep the human in the loop rather than commit junk. */
export function parseQuickAdd(input: string): QuickAddResult | null {
  const text = input.trim();
  if (!text) return null;

  const amountMatch = text.match(/\d+(?:[.,]\d{1,2})?/);
  if (!amountMatch) return null;
  const amount = Number(amountMatch[0].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  // Everything except the matched amount becomes the description.
  const description = (
    text.slice(0, amountMatch.index) + text.slice(amountMatch.index! + amountMatch[0].length)
  )
    .replace(/\s+/g, " ")
    .trim();

  const category = suggestCategory(description || text) ?? "Other";
  return { description: description || "Quick add", amount, category, type: "expense" };
}
