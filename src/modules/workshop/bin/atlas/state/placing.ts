import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

/** A kind of element picked in the components pane and not yet put down. */
export interface Placing {
  /** The view it is placed in, as `viewKey` names it. */
  readonly view: string;
  /** The kind's class. */
  readonly kind: string;
  /** A drag out of its tile carries it, so the pointer's release puts it down or drops it. */
  readonly dragged: boolean;
}

interface PlacingStore {
  placing: Placing | null;
  start: (placing: Placing) => void;
  stop: () => void;
}

/**
 * The component being placed, per "Interaction" in docs/plans/atlas-ui-editor.md.
 *
 * The window listens only while one is placed. Escape lets go of it ahead of every pane's own
 * Escape, and a drag released over no target is dropped. A target's handler runs before the
 * window's, so a release it takes has already stopped the placing.
 */
const usePlacingStore = create<PlacingStore>()((set) => ({
  placing: null,
  start: (placing) => {
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointerup", onPointerUp);
    set({ placing });
  },
  stop: () => {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("pointerup", onPointerUp);
    set({ placing: null });
  },
}));

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;

  event.preventDefault();
  event.stopPropagation();
  usePlacingStore.getState().stop();
}

function onPointerUp() {
  const { placing, stop } = usePlacingStore.getState();
  if (placing?.dragged === true) stop();
}

/** The component being placed in `view`, null where none is. */
export function usePlacing(view: string): Placing | null {
  return usePlacingStore((state) => (state.placing?.view === view ? state.placing : null));
}

export function usePlacingActions() {
  return usePlacingStore(useShallow((state) => ({ start: state.start, stop: state.stop })));
}
