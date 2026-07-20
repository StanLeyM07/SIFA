/**
 * Duplicate detection for the import review screen.
 *
 * Kept as pure functions, separate from the React route, so the money-critical
 * "which rows actually get imported" logic can be unit-tested and can't drift
 * between the three places that used to inline it (the review count, the
 * confirm handler, and the done-screen headline).
 *
 * The headline bug this fixes: the done screen recomputed the imported count
 * against `existingKeys`, but by the time it renders the ledger already
 * contains the rows just imported — so every row counted as a duplicate and a
 * real 50-row import announced "0 transactions in". The count must be captured
 * at confirm time from this function, not recomputed after the ledger changes.
 */

export interface DupCheckable {
  date: string;
  description: string;
  amount: number;
}

/** A row already in the ledger with the same date, amount and description is
 *  almost certainly a re-import — but two identical coffees on one day are
 *  real, so callers flag rather than block. */
export function duplicateKey(r: DupCheckable): string {
  return `${r.date}|${Math.round(r.amount * 100)}|${r.description.trim().toUpperCase()}`;
}

/** Rows that will actually be written, given the current ledger keys and
 *  whether the user asked to skip likely re-imports. */
export function selectRowsToImport<T extends DupCheckable>(
  rows: T[],
  existingKeys: Set<string>,
  skipDuplicates: boolean,
): T[] {
  if (!skipDuplicates) return rows;
  return rows.filter((r) => !existingKeys.has(duplicateKey(r)));
}

/** How many of `rows` already look like transactions in the ledger. */
export function countDuplicates(rows: DupCheckable[], existingKeys: Set<string>): number {
  return rows.filter((r) => existingKeys.has(duplicateKey(r))).length;
}
