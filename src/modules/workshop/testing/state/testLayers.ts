import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { WorkshopLayer } from "@/lib/tauri";
import { keepUnversioned, localJsonStorage } from "@/stores/storage";

const BASE_LAYER = "base";

interface TestLayersStore {
  /** The layers each project's tests leave out, by project path. */
  excluded: Record<string, string[]>;
  toggleLayer: (projectPath: string, layer: string) => void;
}

/**
 * Which layers a workshop test turns on, remembered per project.
 *
 * Holds the layers left out rather than the ones turned on, so a layer a project gains later is
 * tested until it is turned off.
 */
export const useTestLayersStore = create<TestLayersStore>()(
  persist(
    (set) => ({
      excluded: {},
      toggleLayer: (projectPath, layer) =>
        set((state) => {
          const current = state.excluded[projectPath] ?? [];
          const next = current.includes(layer)
            ? current.filter((name) => name !== layer)
            : [...current, layer];

          const excluded = { ...state.excluded };
          if (next.length === 0) {
            delete excluded[projectPath];
          } else {
            excluded[projectPath] = next;
          }

          return { excluded };
        }),
    }),
    {
      name: "workshop-test-layers",
      version: 1,
      migrate: keepUnversioned<TestLayersStore>,
      storage: localJsonStorage,
      partialize: (state) => ({ excluded: state.excluded }) as TestLayersStore,
    },
  ),
);

const NO_LAYERS: string[] = [];

/** The layers a project's tests leave out. */
export function useExcludedTestLayers(projectPath: string): string[] {
  return useTestLayersStore((state) => state.excluded[projectPath] ?? NO_LAYERS);
}

export function useToggleTestLayer() {
  return useTestLayersStore((state) => state.toggleLayer);
}

/**
 * The layers a test of a project turns on, or `null` when it turns on every layer.
 *
 * `base` is always on, and an excluded name the project no longer declares is ignored.
 */
export function testedLayers(layers: WorkshopLayer[], excluded: string[]): string[] | null {
  const tested = layers
    .map((layer) => layer.name)
    .filter((name) => name === BASE_LAYER || !excluded.includes(name));

  if (tested.length === layers.length) return null;
  return tested;
}
