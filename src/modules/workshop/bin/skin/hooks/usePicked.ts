import { useState } from "react";

import type { PhysicsItem } from "../utils/physicsItems";

/** Which item of a Physics pane list is picked, and whether the list or its fields show. */
export interface Picked {
  /** The picked item, and null for an empty list. */
  readonly item: PhysicsItem | null;
  /** Where the picked item stands in the list, and -1 for an empty list. */
  readonly index: number;
  /** The list is unfolded and takes the place of the picked item's fields. */
  readonly listed: boolean;
  /** Move the pick and leave the list as it is, which the arrow keys and the steps do. */
  readonly pick: (path: string) => void;
  /** Pick an item and fold the list, so its fields show. */
  readonly open: (path: string) => void;
  readonly toggleListed: () => void;
}

interface Held {
  readonly path: string | null;
  readonly count: number;
  readonly listed: boolean;
}

/**
 * The pick of one list of the Physics pane.
 *
 * "The physics pane" in docs/ux/SKIN_EDITOR.md. The list starts unfolded on its first
 * item. An item added to the list is opened for the reader, and an empty list stays
 * unfolded since it has no fields to show.
 */
export function usePicked(items: readonly PhysicsItem[]): Picked {
  const [held, setHeld] = useState<Held>({
    path: items[0]?.path ?? null,
    count: items.length,
    listed: true,
  });
  if (items.length !== held.count) {
    const grown = items.length > held.count;
    setHeld({
      path: grown ? items[items.length - 1].path : held.path,
      count: items.length,
      listed: grown ? false : held.listed,
    });
  }

  const found = items.findIndex((each) => each.path === held.path);
  const index = found >= 0 ? found : items.length - 1;

  return {
    item: items[index] ?? null,
    index,
    listed: held.listed || items.length === 0,
    pick: (path) => setHeld((before) => ({ ...before, path })),
    open: (path) => setHeld((before) => ({ ...before, path, listed: false })),
    toggleListed: () => setHeld((before) => ({ ...before, listed: !before.listed })),
  };
}
