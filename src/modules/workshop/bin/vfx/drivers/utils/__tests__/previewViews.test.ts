import { describe, expect, it, vi } from "vitest";

import { PreviewViewStore, viewPlace } from "../previewViews";

const CANVAS = { left: 660, top: 222, width: 2108, height: 868 };

describe("viewPlace", () => {
  it("places a box on the canvas from the canvas's bottom left", () => {
    expect(viewPlace({ left: 700, top: 300, width: 200, height: 180 }, CANVAS)).toEqual({
      left: 40,
      bottom: 610,
      width: 200,
      height: 180,
    });
  });

  it("draws a box far to the right while any of it is on the canvas", () => {
    const place = viewPlace({ left: 2700, top: 300, width: 200, height: 180 }, CANVAS);

    expect(place?.left).toBe(2040);
  });

  it("draws no box past an edge or with no area", () => {
    expect(viewPlace({ left: 2768, top: 300, width: 200, height: 180 }, CANVAS)).toBeNull();
    expect(viewPlace({ left: 400, top: 300, width: 260, height: 180 }, CANVAS)).toBeNull();
    expect(viewPlace({ left: 700, top: 1090, width: 200, height: 180 }, CANVAS)).toBeNull();
    expect(viewPlace({ left: 700, top: 300, width: 0, height: 180 }, CANVAS)).toBeNull();
  });
});

describe("PreviewViewStore", () => {
  it("replaces a view in place, drops it, and tells its listeners each time", () => {
    const store = new PreviewViewStore();
    const heard = vi.fn();
    store.subscribe(heard);
    const box = { current: null };

    store.set({ id: "a", box, children: "first" });
    store.set({ id: "b", box, children: null });
    store.set({ id: "a", box, children: "second" });
    store.delete("a");
    store.delete("missing");

    expect(store.snapshot().map((each) => each.id)).toEqual(["b"]);
    expect(heard).toHaveBeenCalledTimes(4);
  });
});
