import type { Color } from "three";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { useTokenColor } from "@/modules/viewport";
import { keepUnversioned, localJsonStorage } from "@/stores/storage";

/** How light the ground behind an emitter's previews is, in the Graph pane and the inspector. */
export type PreviewBackdrop = "dark" | "grey" | "light";

/* DS-TOKEN: rungs of the surface ramp, so a theme moves them with the rest of the pane. */
const TOKEN: Record<PreviewBackdrop, string> = {
  dark: "--color-surface-950",
  grey: "--color-surface-700",
  light: "--color-surface-500",
};

const NEXT: Record<PreviewBackdrop, PreviewBackdrop> = {
  dark: "grey",
  grey: "light",
  light: "dark",
};

interface PreviewBackdropStore {
  backdrop: PreviewBackdrop;
  cycle: () => void;
}

const usePreviewBackdropStore = create<PreviewBackdropStore>()(
  persist(
    (set) => ({
      backdrop: "grey",
      cycle: () => set((state) => ({ backdrop: NEXT[state.backdrop] })),
    }),
    {
      name: "vfx-preview-backdrop",
      version: 1,
      migrate: keepUnversioned<PreviewBackdropStore>,
      storage: localJsonStorage,
    },
  ),
);

export function usePreviewBackdrop(): PreviewBackdrop {
  return usePreviewBackdropStore((state) => state.backdrop);
}

export function useCyclePreviewBackdrop(): () => void {
  return usePreviewBackdropStore((state) => state.cycle);
}

/** The previews' ground as a scene colour, for a canvas to clear to. */
export function useBackdropColor(): Color {
  return useTokenColor(TOKEN[usePreviewBackdrop()]);
}

/** The previews' ground as CSS, for a box a preview draws in to show while it draws nothing. */
export function useBackdropCss(): string {
  return `var(${TOKEN[usePreviewBackdrop()]})`;
}
