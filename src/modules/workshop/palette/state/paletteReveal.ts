import { useCallback, useEffect } from "react";
import { create } from "zustand";

import type { PaletteSourceId } from "../utils/types";

interface PaletteRevealStore {
  /**
   * Bumped by every route into the bar's palette from outside the bar.
   *
   * A counter rather than a flag, so two reveals in a row both land.
   */
  reveal: number;
  /** The last reveal the bar answered, so a rerender opens nothing. */
  answered: number;
  /** The source the palette opens scoped to, null for its whole listing. */
  scope: PaletteSourceId | null;
  bump: (scope: PaletteSourceId | null) => void;
  answer: (reveal: number) => void;
}

const useRevealStore = create<PaletteRevealStore>()((set) => ({
  reveal: 0,
  answered: 0,
  scope: null,
  bump: (scope) => set((state) => ({ reveal: state.reveal + 1, scope })),
  answer: (reveal) => set({ answered: reveal }),
}));

/** Open the bar's palette, scoped to one source or on its whole listing. */
export function useRevealPalette(): (scope: PaletteSourceId | null) => void {
  const bump = useRevealStore((state) => state.bump);

  return useCallback((scope: PaletteSourceId | null) => bump(scope), [bump]);
}

/**
 * Open the palette on every reveal the bar has not answered yet.
 *
 * The answered mark is what separates a reveal from the renders the bar does
 * on its own, which must open nothing.
 */
export function usePaletteRevealTarget(open: (scope: PaletteSourceId | null) => void): void {
  const reveal = useRevealStore((state) => state.reveal);
  const answered = useRevealStore((state) => state.answered);
  const scope = useRevealStore((state) => state.scope);
  const answer = useRevealStore((state) => state.answer);

  useEffect(() => {
    if (reveal === answered) return;
    answer(reveal);
    open(scope);
  }, [reveal, answered, scope, answer, open]);
}
