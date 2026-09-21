import { create } from "zustand";

interface CopiedReferenceStore {
  /** The game-copy reference a row last copied, `<entry>:<property path>`. */
  reference: string | null;
  copy: (reference: string) => void;
}

/**
 * The reference Copy reference last put on the clipboard, which Paste reference and Merge
 * reference write. Held here because the webview reads no clipboard without a permission the
 * app does not ask for.
 */
export const useCopiedReferenceStore = create<CopiedReferenceStore>()((set) => ({
  reference: null,
  copy: (reference) => set({ reference }),
}));

export const useCopiedReference = () => useCopiedReferenceStore((state) => state.reference);
export const useRememberReference = () => useCopiedReferenceStore((state) => state.copy);
