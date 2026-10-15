import { type ReactFlowState, useStore, useStoreApi } from "@xyflow/react";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useLayoutEffect,
  useSyncExternalStore,
} from "react";

/** The zoom under which a node's rows give way to its plate. */
export const FAR_ZOOM = 0.6;

/** The graph canvas's React Flow store, and null outside the canvas. */
const FlowStoreContext = createContext<ReturnType<typeof useStoreApi> | null>(null);

/** Hands the canvas's React Flow store to `useFarZoom`, under the `ReactFlowProvider`. */
export function FlowStore({ children }: { children: ReactNode }) {
  return <FlowStoreContext value={useStoreApi()}>{children}</FlowStoreContext>;
}

/**
 * Returns whether the canvas is zoomed out past `FAR_ZOOM`, which re-renders only as the zoom
 * crosses it. Returns false outside the canvas, such as in the inspector.
 */
export function useFarZoom(): boolean {
  const store = use(FlowStoreContext);
  const subscribe = useCallback(
    (listener: () => void) => store?.subscribe(listener) ?? noUnsubscribe,
    [store],
  );
  return useSyncExternalStore(subscribe, () => (store === null ? false : isFar(store.getState())));
}

function noUnsubscribe(): void {}

function isFar(state: ReactFlowState): boolean {
  return state.transform[2] < FAR_ZOOM;
}

/** The zoom, and `FAR_ZOOM` for any zoom at or above it. */
export function farZoom(state: Pick<ReactFlowState, "transform">): number {
  return Math.min(state.transform[2], FAR_ZOOM);
}

/**
 * Writes the zoom onto the canvas root as `--graph-zoom` and `data-detail`.
 *
 * The nodes read both from CSS, so scaling a plate re-renders no node, and crossing `FAR_ZOOM`
 * re-renders only the parts `useFarZoom` switches off.
 *
 * The variable stops at `FAR_ZOOM`. Only the far plates read it, and an inherited variable
 * written on the root restyles every element under it, so a zoom above `FAR_ZOOM` writes
 * nothing.
 */
export function ZoomDetail() {
  const zoom = useStore(farZoom);
  const root = useStore((state) => state.domNode);

  useLayoutEffect(() => {
    if (root === null) return;

    root.style.setProperty("--graph-zoom", String(zoom));
    root.dataset.detail = zoom < FAR_ZOOM ? "far" : "near";
  }, [root, zoom]);

  return null;
}
