import { type ReactNode, useCallback, useLayoutEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/** A place in the window's frame a page draws into: the title bar's middle, the status row's end. */
export type ChromeSlotName = "title" | "status";

interface SlotState {
  readonly host: HTMLElement | null;
  readonly fills: number;
}

const EMPTY: SlotState = { host: null, fills: 0 };

let slots: Record<ChromeSlotName, SlotState> = { title: EMPTY, status: EMPTY };
let grounds = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function update(name: ChromeSlotName, change: (held: SlotState) => SlotState) {
  const held = slots[name];
  const next = change(held);
  if (next === held) {
    return;
  }

  slots = { ...slots, [name]: next };
  announce();
}

function announce() {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Where the frame offers a slot. It has no box of its own, so what a page portals in lays
 * out against the slot's parent, and an unfilled slot takes no room.
 */
export function ChromeSlot({ name }: { name: ChromeSlotName }) {
  const adopt = useCallback(
    (element: HTMLDivElement) => {
      update(name, (held) => ({ ...held, host: element }));

      return () => {
        update(name, (held) => (held.host === element ? { ...held, host: null } : held));
      };
    },
    [name],
  );

  return <div ref={adopt} data-ui={`ChromeSlot:${name}`} className="contents" />;
}

/** `children` drawn in the frame's `slot`, and nothing while the frame offers none. */
export function ChromePortal({ slot, children }: { slot: ChromeSlotName; children: ReactNode }) {
  const host = useSyncExternalStore(subscribe, () => slots[slot].host);

  useLayoutEffect(() => {
    update(slot, (held) => ({ ...held, fills: held.fills + 1 }));

    return () => {
      update(slot, (held) => ({ ...held, fills: held.fills - 1 }));
    };
  }, [slot]);

  if (host === null) {
    return null;
  }

  return createPortal(children, host);
}

/** Mounted by a page whose ground runs to the window's edges, so the frame draws on that ground. */
export function ChromeGround() {
  useLayoutEffect(() => {
    grounds += 1;
    announce();

    return () => {
      grounds -= 1;
      announce();
    };
  }, []);

  return null;
}

/** Whether a page has asked the frame onto its own ground, with no edge between the two. */
export function useChromeGrounded(): boolean {
  return useSyncExternalStore(subscribe, () => grounds > 0);
}

/** Whether a page is drawing into `name`, which is when the frame has to keep the slot on screen. */
export function useChromeSlotFilled(name: ChromeSlotName): boolean {
  return useSyncExternalStore(subscribe, () => slots[name].fills > 0);
}
