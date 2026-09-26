import { create } from "zustand";
import { persist } from "zustand/middleware";

import { keepUnversioned, localJsonStorage } from "@/stores/storage";

interface InspectorViewStore {
  /** The inspector draws only the properties the file defines, and none at its default. */
  definedOnly: boolean;
  toggleDefinedOnly: () => void;
  /** The inspector draws the open emitter's preview over its properties. */
  preview: boolean;
  togglePreview: () => void;
}

export const useInspectorViewStore = create<InspectorViewStore>()(
  persist(
    (set) => ({
      definedOnly: false,
      toggleDefinedOnly: () => set((state) => ({ definedOnly: !state.definedOnly })),
      preview: true,
      togglePreview: () => set((state) => ({ preview: !state.preview })),
    }),
    {
      name: "vfx-inspector-view",
      version: 1,
      migrate: keepUnversioned<InspectorViewStore>,
      storage: localJsonStorage,
    },
  ),
);

export function useDefinedOnly(): boolean {
  return useInspectorViewStore((state) => state.definedOnly);
}

export function useToggleDefinedOnly(): () => void {
  return useInspectorViewStore((state) => state.toggleDefinedOnly);
}

export function useInspectorPreview(): boolean {
  return useInspectorViewStore((state) => state.preview);
}

export function useToggleInspectorPreview(): () => void {
  return useInspectorViewStore((state) => state.togglePreview);
}
