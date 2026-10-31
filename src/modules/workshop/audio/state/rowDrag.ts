import { getCurrentWindow } from "@tauri-apps/api/window";
import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useRef } from "react";
import { create } from "zustand";

import { ASSET_DROP_EVENT, type AssetDropDetail } from "../../content/state/assetDrag";
import type { DragPayload } from "../utils/dropTargets";

/** The attribute of a row that takes a drop, which holds the row's key. */
export const SLOT_ATTRIBUTE = "data-audio-slot";

/** The attribute that the slot under a drag carries, which the row draws its hover with. */
const OVER_ATTRIBUTE = "data-audio-over";

/** The event that a released drag sends to the slot under the pointer, which bubbles to its list. */
const ROW_DROP_EVENT = "ltk-audio-drop";

/** How far a press travels before it drags, in pixels. */
const DRAG_START = 4;

/** A row drag in flight: what the ghost names and where the pointer is. */
interface RowDrag {
  /** The list that started the drag, which alone draws the ghost. */
  readonly source: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
}

const useRowDragStore = create<{ drag: RowDrag | null }>()(() => ({ drag: null }));

/** Returns the drag that the list `source` started, or null. */
export function useRowDrag(source: string): RowDrag | null {
  return useRowDragStore((state) => (state.drag?.source === source ? state.drag : null));
}

/** Returns the slot element at a point of the window, or null. */
function slotAt(x: number, y: number): Element | null {
  return document.elementFromPoint(x, y)?.closest(`[${SLOT_ATTRIBUTE}]`) ?? null;
}

let hovered: Element | null = null;

/** Marks `slot` as the one under a drag, and clears the mark of the one before it. */
function hover(slot: Element | null) {
  if (slot === hovered) return;

  hovered?.removeAttribute(OVER_ATTRIBUTE);
  slot?.setAttribute(OVER_ATTRIBUTE, "");
  hovered = slot;
}

function send(slot: Element, payload: DragPayload) {
  slot.dispatchEvent(
    new CustomEvent<DragPayload>(ROW_DROP_EVENT, { bubbles: true, detail: payload }),
  );
}

/**
 * Drags `payload` from a press of the primary button without a modifier, once the pointer travels
 * `DRAG_START` pixels.
 *
 * Pointer events rather than HTML drag and drop, as `beginAssetDrag` does, because the webview's
 * file drop takes the HTML drop events on Windows. A release over a slot sends the payload to it,
 * the click that the release makes is dropped, and Escape drops the drag.
 */
export function beginRowDrag(
  event: ReactPointerEvent,
  payload: DragPayload,
  source: string,
  label: string,
) {
  const modified = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
  if (event.button !== 0 || modified) return;

  const from = { x: event.clientX, y: event.clientY };
  let dragging = false;

  const swallowClick = (click: MouseEvent) => {
    click.stopPropagation();
    click.preventDefault();
  };
  const stop = () => {
    hover(null);
    useRowDragStore.setState({ drag: null });
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("keydown", key, true);
  };
  const move = (next: PointerEvent) => {
    const far = Math.hypot(next.clientX - from.x, next.clientY - from.y) >= DRAG_START;
    if (!dragging && !far) return;

    dragging = true;
    next.preventDefault();
    useRowDragStore.setState({ drag: { source, label, x: next.clientX, y: next.clientY } });
    hover(slotAt(next.clientX, next.clientY));
  };
  const up = (next: PointerEvent) => {
    const slot = dragging ? slotAt(next.clientX, next.clientY) : null;
    stop();
    if (!dragging) return;

    window.addEventListener("click", swallowClick, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", swallowClick, true), 0);
    if (slot !== null) send(slot, payload);
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

/** Returns the key of the slot that `target` sits in, inside `list`. */
function slotKey(list: HTMLElement, target: EventTarget | null): string | null {
  const slot = target instanceof Element ? target.closest(`[${SLOT_ATTRIBUTE}]`) : null;
  return slot !== null && list.contains(slot) ? slot.getAttribute(SLOT_ATTRIBUTE) : null;
}

/**
 * Hands each drop on a slot of the list `ref` holds to `onDrop`, with the slot's key: a row drag,
 * a content tree drag of a file, and a file dropped from the OS.
 *
 * A drop that `onDrop` answers `true` for reaches no target above the list. Per "Keys and
 * gestures" in docs/ux/AUDIO.md.
 */
export function useRowDrops(
  ref: RefObject<HTMLElement | null>,
  onDrop: (key: string, payload: DragPayload) => boolean,
) {
  const latest = useRef(onDrop);
  useEffect(() => {
    latest.current = onDrop;
  });

  /* Heard on the document and matched to the list at the drop, because a list may mount after
     the hook does, once its rows have loaded. */
  useEffect(() => {
    const take = (event: Event, payload: DragPayload) => {
      const list = ref.current;
      const key = list === null ? null : slotKey(list, event.target);
      if (key !== null && latest.current(key, payload)) event.stopPropagation();
    };
    const row = (event: Event) => take(event, (event as CustomEvent<DragPayload>).detail);
    const asset = (event: Event) => {
      const { file } = (event as CustomEvent<AssetDropDetail>).detail;
      if (file !== null) take(event, { kind: "file", path: file });
    };

    document.addEventListener(ROW_DROP_EVENT, row);
    document.addEventListener(ASSET_DROP_EVENT, asset);
    return () => {
      document.removeEventListener(ROW_DROP_EVENT, row);
      document.removeEventListener(ASSET_DROP_EVENT, asset);
    };
  }, [ref]);

  /* A drop event crosses IPC, and every mounted list hears it, so a list takes the drops whose
     point lands on one of its own slots. */
  useEffect(() => {
    const unlisten = getCurrentWindow().onDragDropEvent((event) => {
      const list = ref.current;
      if (list === null) return;

      if (event.payload.type === "leave") {
        hover(null);
        return;
      }

      /* The event reports physical pixels of the window. */
      const x = event.payload.position.x / window.devicePixelRatio;
      const y = event.payload.position.y / window.devicePixelRatio;
      const slot = slotAt(x, y);
      const inside = slot !== null && list.contains(slot);
      if (event.payload.type === "over" || event.payload.type === "enter") {
        if (inside || (hovered !== null && list.contains(hovered))) hover(inside ? slot : null);
        return;
      }

      hover(null);
      const [path] = event.payload.paths;
      if (!inside || path === undefined) return;

      const key = slot.getAttribute(SLOT_ATTRIBUTE);
      if (key !== null) latest.current(key, { kind: "file", path });
    });
    return () => {
      void unlisten.then((stopListening) => stopListening());
    };
  }, [ref]);
}
