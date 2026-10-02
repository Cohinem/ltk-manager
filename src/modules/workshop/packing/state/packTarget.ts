import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { PackFormat } from "@/lib/tauri";
import { keepUnversioned, localJsonStorage } from "@/stores/storage";

/** What a press of Pack writes: both archives, or one format alone. */
export type PackTarget = "both" | PackFormat;

interface PackTargetStore {
  target: PackTarget;
  setTarget: (target: PackTarget) => void;
}

/** The formats Pack writes, remembered across projects and sessions. */
export const usePackTargetStore = create<PackTargetStore>()(
  persist(
    (set) => ({
      target: "both",
      setTarget: (target) => set({ target }),
    }),
    {
      name: "workshop-pack-target",
      version: 1,
      migrate: keepUnversioned<PackTargetStore>,
      storage: localJsonStorage,
      partialize: (state) => ({ target: state.target }) as PackTargetStore,
    },
  ),
);

export function usePackTarget(): PackTarget {
  return usePackTargetStore((state) => state.target);
}

export function useSetPackTarget() {
  return usePackTargetStore((state) => state.setTarget);
}

/** The archives `target` writes, `.modpkg` first. */
export function packFormats(target: PackTarget): PackFormat[] {
  if (target === "both") return ["modpkg", "fantome"];
  return [target];
}
