import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect } from "react";
import { create } from "zustand";

/** A game path dragged out of the content tree, and where the pointer is. */
export interface AssetDrag {
  readonly path: string;
  readonly x: number;
  readonly y: number;
}

/** The event a released drag sends to the element under the pointer, which bubbles up to a target. */
export const ASSET_DROP_EVENT = "ltk-asset-drop";

/** The attribute an element that takes a dropped path carries, and the one the drag hovers it with. */
export const ASSET_DROP_ATTRIBUTE = "data-asset-drop";
const OVER_ATTRIBUTE = "data-asset-over";

/** How far a press travels before it drags, in pixels. */
const DRAG_START = 4;

export interface AssetDropDetail {
  readonly path: string;
  readonly x: number;
  readonly y: number;
}

interface AssetDragStore {
  drag: AssetDrag | null;
}

const useAssetDragStore = create<AssetDragStore>()(() => ({ drag: null }));

/** The drag in flight, which the ghost follows. */
export function useAssetDrag(): AssetDrag | null {
  return useAssetDragStore((state) => state.drag);
}

/**
 * Drag `path` from a press, once the pointer travels `DRAG_START` pixels.
 *
 * Pointer events rather than HTML drag and drop, since the webview's own file drop takes the
 * HTML drop events on Windows. A release sends `ASSET_DROP_EVENT` to the element under the
 * pointer, and Escape drops the drag.
 */
export function beginAssetDrag(event: ReactPointerEvent, path: string) {
  if (event.button !== 0) return;

  const from = { x: event.clientX, y: event.clientY };
  let dragging = false;
  let over: Element | null = null;

  const hover = (x: number, y: number) => {
    const target = document.elementFromPoint(x, y)?.closest(`[${ASSET_DROP_ATTRIBUTE}]`) ?? null;
    if (target === over) return;

    over?.removeAttribute(OVER_ATTRIBUTE);
    target?.setAttribute(OVER_ATTRIBUTE, "");
    over = target;
  };
  const stop = () => {
    over?.removeAttribute(OVER_ATTRIBUTE);
    useAssetDragStore.setState({ drag: null });
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("keydown", key, true);
  };
  const move = (next: PointerEvent) => {
    if (!dragging && Math.hypot(next.clientX - from.x, next.clientY - from.y) < DRAG_START) return;

    dragging = true;
    next.preventDefault();
    useAssetDragStore.setState({ drag: { path, x: next.clientX, y: next.clientY } });
    hover(next.clientX, next.clientY);
  };
  const up = (next: PointerEvent) => {
    const target = dragging ? document.elementFromPoint(next.clientX, next.clientY) : null;
    stop();
    if (target === null) return;

    const detail: AssetDropDetail = { path, x: next.clientX, y: next.clientY };
    target.dispatchEvent(new CustomEvent(ASSET_DROP_EVENT, { bubbles: true, detail }));
  };
  const key = (next: KeyboardEvent) => {
    if (next.key !== "Escape" || !dragging) return;

    next.stopPropagation();
    stop();
  };

  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("keydown", key, true);
}

/**
 * Take a dropped path on the element `ref` holds, which carries `ASSET_DROP_ATTRIBUTE`.
 *
 * `onDrop` answers whether it used the path, and a used drop reaches no target above it.
 */
export function useAssetDrop(
  ref: RefObject<HTMLElement | null>,
  onDrop: ((drop: AssetDropDetail) => boolean) | null,
) {
  useEffect(() => {
    const element = ref.current;
    if (element === null || onDrop === null) return;

    const take = (event: Event) => {
      if (onDrop((event as CustomEvent<AssetDropDetail>).detail)) event.stopPropagation();
    };
    element.addEventListener(ASSET_DROP_EVENT, take);
    return () => element.removeEventListener(ASSET_DROP_EVENT, take);
  }, [ref, onDrop]);
}
