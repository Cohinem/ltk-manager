import { create } from "zustand";

interface MaskHoverStore {
  /** The key of the mask whose mark is under the pointer, which every mark of that mask lights for. */
  hovered: string | null;
  setHovered: (key: string | null) => void;
}

const useMaskHoverStore = create<MaskHoverStore>()((set) => ({
  hovered: null,
  setHovered: (hovered) => set({ hovered }),
}));

/** Whether the mask `key` is the one under the pointer. A null key is never hovered. */
export function useMaskHovered(key: string | null): boolean {
  return useMaskHoverStore((state) => key !== null && state.hovered === key);
}

export function useSetMaskHovered(): (key: string | null) => void {
  return useMaskHoverStore((state) => state.setHovered);
}
