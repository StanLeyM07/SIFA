import { applyCorrection, type CorrectionMap } from "../categorize/engine";
import { storage } from "../storage";
import type { Category } from "../types";

interface RowLike {
  description: string;
  category: string;
}

function loadCorrections(): CorrectionMap {
  return storage.getMerchantRules() as CorrectionMap;
}

/**
 * Persist the user's category choices so the same merchant is recognised next
 * time. Called on import confirm, once they've reviewed the table.
 *
 * Only rows the user actually changed are learned from — re-saving an
 * unmodified dictionary hit would just shadow the dictionary with a copy of
 * itself, and would wrongly pin a category the dictionary might later improve.
 */
export function recordCorrections(rows: RowLike[], originals: RowLike[]): void {
  let map = loadCorrections();
  let changed = false;

  rows.forEach((row, i) => {
    const before = originals[i];
    if (!before || before.category === row.category) return;
    map = applyCorrection(map, row.description, row.category as Category);
    changed = true;
  });

  if (changed) storage.setMerchantRules(map);
}
