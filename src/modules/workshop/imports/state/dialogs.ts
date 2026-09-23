import type { FantomePeekResult } from "@/lib/tauri";
import { createDialogStore } from "@/stores/createDialogStore";

export const useGitImportDialog = createDialogStore();

/** A fantome archive picked for import, as what was read out of it and where it sits. */
export interface FantomeImport {
  peekResult: FantomePeekResult;
  filePath: string;
}

export const useFantomeImportDialog = createDialogStore<FantomeImport>();
