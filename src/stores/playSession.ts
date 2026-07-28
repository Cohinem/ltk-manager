import { create } from "zustand";

/** Where a composed "Play" has got to. */
export type PlayStep = "idle" | "starting-patcher" | "launching";

interface PlaySessionStore {
  step: PlayStep;
  setStep: (step: PlayStep) => void;
}

/**
 * The current Play run, shared rather than local.
 */
export const usePlaySessionStore = create<PlaySessionStore>((set) => ({
  step: "idle",
  setStep: (step) => set({ step }),
}));
