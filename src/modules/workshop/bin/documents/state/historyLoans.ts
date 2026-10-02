import type { BinDocumentId } from "@/lib/tauri";
import type { HistoryStep } from "@/modules/editor";

/**
 * One step through a document a tab edits besides its own, answering whether it held one.
 *
 * Atlas lends the scene bin a view's canvas edits to the tab of the view's controller, so the
 * undo keys of that tab reach the canvas's edits.
 */
export type HistoryLoan = (step: HistoryStep) => Promise<boolean>;

/** Each tab document's loan, by its open id. Ids are never reused. */
const loans = new Map<BinDocumentId, HistoryLoan>();

/** Lend `loan` to the tab of `owner`, answering the withdrawal. */
export function lendHistory(owner: BinDocumentId, loan: HistoryLoan): () => void {
  loans.set(owner, loan);
  return () => {
    if (loans.get(owner) === loan) loans.delete(owner);
  };
}

/** The history lent to the tab of `owner`, which its undo steps before its own. */
export function historyLoan(owner: BinDocumentId): HistoryLoan | undefined {
  return loans.get(owner);
}
