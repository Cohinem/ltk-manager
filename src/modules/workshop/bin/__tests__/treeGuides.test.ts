import { describe, expect, it, vi } from "vitest";

import { createGuideStore } from "../treeGuides";

describe("createGuideStore", () => {
  it("keeps the hover when the active block moves, and the active when the hover does", () => {
    const store = createGuideStore();
    store.set({ active: "a:" });
    store.set({ hover: "b:" });

    expect(store.get()).toEqual({ active: "a:", hover: "b:" });
  });

  /* A pointer crossing twenty rows of one block asks twenty times, and redraws nothing. */
  it("tells its listeners only when a block changes", () => {
    const store = createGuideStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({ hover: "b:" });
    store.set({ hover: "b:" });
    store.set({ active: null });

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
