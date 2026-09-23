import { create } from "zustand";

import type { HeldValue } from "@/modules/viewport";

interface HeldValueStore {
  /** The parameter value a control holds, which no read of the bin carries yet. */
  held: HeldValue | null;
  hold: (held: HeldValue) => void;
  /** Let `held` go, and nothing where another value has been taken since. */
  release: (held: HeldValue) => void;
}

/**
 * The one value a material control holds, which every preview drawing its material draws.
 *
 * One store, because one pointer drags one control, and the preview and the inspector sit in
 * different panes of the shell.
 */
export const useHeldValueStore = create<HeldValueStore>()((set) => ({
  held: null,
  hold: (held) => set({ held }),
  release: (held) =>
    set((state) =>
      state.held?.material === held.material && state.held.physical === held.physical
        ? { held: null }
        : state,
    ),
}));

export const useHeldValue = () => useHeldValueStore((state) => state.held);
