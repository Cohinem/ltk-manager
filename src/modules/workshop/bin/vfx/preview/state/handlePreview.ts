import { create } from "zustand";

import type { EmitterModel, SystemModel } from "../../engine/model/model";

/** An emitter with a handle drag's value written, and the system it was dragged in. */
export interface HandlePreview {
  readonly system: SystemModel;
  readonly emitter: EmitterModel;
}

interface HandlePreviewStore {
  preview: HandlePreview | null;
}

const useHandlePreviewStore = create<HandlePreviewStore>()(() => ({ preview: null }));

/**
 * The emitter a handle drag previews in `system`, and null outside a drag.
 *
 * A released drag keeps its emitter until the document reads again, which gives `system` a
 * new identity, so the marks do not show the value from before the drag in between.
 */
export function useHandlePreview(system: SystemModel): EmitterModel | null {
  return useHandlePreviewStore((state) =>
    state.preview?.system === system ? state.preview.emitter : null,
  );
}

export function setHandlePreview(preview: HandlePreview | null): void {
  useHandlePreviewStore.setState({ preview });
}
