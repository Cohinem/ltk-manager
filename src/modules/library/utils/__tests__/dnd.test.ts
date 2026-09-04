import type { CollisionDetection } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";

import {
  applyDropSlot,
  closestToPointer,
  dropLineFor,
  dropSlotFor,
  hasOrderChanged,
  isSameSlot,
  nearestToPointer,
  NO_DROP_LINE,
  parseFolderDropId,
  pointerInRemoveZone,
  REMOVE_FROM_FOLDER_ID,
  resolveDropTarget,
} from "../dnd";

describe("parseFolderDropId", () => {
  it("extracts folder ID from prefixed string", () => {
    expect(parseFolderDropId("folder:abc-123")).toBe("abc-123");
  });

  it("returns null for non-folder IDs", () => {
    expect(parseFolderDropId("mod-123")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseFolderDropId("")).toBeNull();
  });

  it("handles folder prefix with empty ID", () => {
    expect(parseFolderDropId("folder:")).toBe("");
  });

  it("handles IDs containing 'folder' but without prefix", () => {
    expect(parseFolderDropId("my-folder-item")).toBeNull();
  });
});

describe("resolveDropTarget", () => {
  it("returns folder target for folder-prefixed ID", () => {
    expect(resolveDropTarget("folder:abc")).toEqual({ type: "folder", folderId: "abc" });
  });

  it("returns reorder target for non-folder ID", () => {
    expect(resolveDropTarget("mod-123")).toEqual({ type: "reorder" });
  });
});

describe("hasOrderChanged", () => {
  it("returns false for identical arrays", () => {
    expect(hasOrderChanged(["a", "b", "c"], ["a", "b", "c"])).toBe(false);
  });

  it("returns true for different order", () => {
    expect(hasOrderChanged(["a", "b", "c"], ["c", "b", "a"])).toBe(true);
  });

  it("returns true for different lengths", () => {
    expect(hasOrderChanged(["a", "b"], ["a", "b", "c"])).toBe(true);
  });

  it("returns false for empty arrays", () => {
    expect(hasOrderChanged([], [])).toBe(false);
  });

  it("returns true when one is empty", () => {
    expect(hasOrderChanged(["a"], [])).toBe(true);
  });
});

describe("dropSlotFor", () => {
  const order = ["a", "b", "c", "d"];

  it("marks the far edge when dragging down the list", () => {
    expect(dropSlotFor(order, "a", "c")).toEqual({ id: "c", side: "after" });
  });

  it("marks the near edge when dragging up the list", () => {
    expect(dropSlotFor(order, "d", "b")).toEqual({ id: "b", side: "before" });
  });

  it("marks no gap over the card being dragged", () => {
    expect(dropSlotFor(order, "a", "a")).toBeNull();
  });

  it("marks no gap for an id the list does not hold", () => {
    expect(dropSlotFor(order, "a", "gone")).toBeNull();
    expect(dropSlotFor(order, "gone", "a")).toBeNull();
  });
});

describe("applyDropSlot", () => {
  const order = ["a", "b", "c", "d"];

  it("drops after the marked card", () => {
    expect(applyDropSlot(order, "a", { id: "c", side: "after" })).toEqual(["b", "c", "a", "d"]);
  });

  it("drops before the marked card", () => {
    expect(applyDropSlot(order, "d", { id: "b", side: "before" })).toEqual(["a", "d", "b", "c"]);
  });

  it("drops at the head of the list", () => {
    expect(applyDropSlot(order, "c", { id: "a", side: "before" })).toEqual(["c", "a", "b", "d"]);
  });

  it("drops at the tail of the list", () => {
    expect(applyDropSlot(order, "a", { id: "d", side: "after" })).toEqual(["b", "c", "d", "a"]);
  });

  it("leaves the order alone for a card the list does not hold", () => {
    expect(applyDropSlot(order, "a", { id: "gone", side: "after" })).toEqual(order);
  });
});

describe("isSameSlot", () => {
  it("matches two slots on the same gap", () => {
    expect(isSameSlot({ id: "a", side: "after" }, { id: "a", side: "after" })).toBe(true);
  });

  it("separates the two edges of one card", () => {
    expect(isSameSlot({ id: "a", side: "after" }, { id: "a", side: "before" })).toBe(false);
  });

  it("matches two absent slots", () => {
    expect(isSameSlot(null, null)).toBe(true);
  });

  it("separates a slot from no slot", () => {
    expect(isSameSlot({ id: "a", side: "after" }, null)).toBe(false);
  });
});

describe("closestToPointer", () => {
  type Args = Parameters<CollisionDetection>[0];

  /** Two cards side by side, 100 wide with a 20 gutter between them. */
  function grid(pointer: { x: number; y: number } | null): Args {
    const rect = (left: number) => ({
      top: 0,
      bottom: 100,
      left,
      right: left + 100,
      width: 100,
      height: 100,
    });
    const droppableRects = new Map([
      ["a", rect(0)],
      ["b", rect(120)],
    ]);
    return {
      active: { id: "a", data: { current: undefined }, rect: { current: {} } },
      collisionRect: rect(0),
      droppableRects,
      droppableContainers: [...droppableRects.keys()].map((id) => ({
        id,
        rect: { current: droppableRects.get(id) },
        data: { current: undefined },
      })),
      pointerCoordinates: pointer,
    } as unknown as Args;
  }

  it("picks the card the pointer is inside, whatever the dragged box says", () => {
    expect(closestToPointer(grid({ x: 170, y: 50 }))[0]?.id).toBe("b");
  });

  it("picks the nearer card when the pointer sits in the gutter", () => {
    expect(closestToPointer(grid({ x: 115, y: 50 }))[0]?.id).toBe("b");
    expect(closestToPointer(grid({ x: 105, y: 50 }))[0]?.id).toBe("a");
  });

  it("falls back to the dragged box when there is no pointer", () => {
    expect(closestToPointer(grid(null))[0]?.id).toBe("a");
  });

  it("measures from the pointer even where it sits inside a card", () => {
    expect(nearestToPointer(grid({ x: 170, y: 50 }))[0]?.id).toBe("b");
  });
});

describe("pointerInRemoveZone", () => {
  type Args = Parameters<CollisionDetection>[0];

  /** The zone across the top of the list, with a card well below it. */
  function list(pointer: { x: number; y: number }, withZone = true): Args {
    const rects = new Map([
      [REMOVE_FROM_FOLDER_ID, { top: 0, bottom: 40, left: 0, right: 200, width: 200, height: 40 }],
      ["a", { top: 100, bottom: 200, left: 0, right: 200, width: 200, height: 100 }],
    ]);
    if (!withZone) rects.delete(REMOVE_FROM_FOLDER_ID);
    return {
      active: { id: "a", data: { current: undefined }, rect: { current: {} } },
      droppableRects: rects,
      droppableContainers: [...rects.keys()].map((id) => ({
        id,
        rect: { current: rects.get(id) },
        data: { current: undefined },
      })),
      pointerCoordinates: pointer,
    } as unknown as Args;
  }

  it("answers with the zone when the pointer is inside it", () => {
    expect(pointerInRemoveZone(list({ x: 100, y: 20 }))?.id).toBe(REMOVE_FROM_FOLDER_ID);
  });

  it("never answers with a card the pointer is over", () => {
    expect(pointerInRemoveZone(list({ x: 100, y: 150 }))).toBeNull();
  });

  it("answers with nothing when the zone is not mounted", () => {
    expect(pointerInRemoveZone(list({ x: 100, y: 20 }, false))).toBeNull();
  });
});

describe("dropLineFor", () => {
  const line = { slot: { id: "b", side: "before" as const }, visible: true };

  it("gives the target card the edge and the visibility", () => {
    expect(dropLineFor(line, "b")).toEqual({ side: "before", visible: true });
  });

  it("holds the edge while the line fades", () => {
    expect(dropLineFor({ ...line, visible: false }, "b")).toEqual({
      side: "before",
      visible: false,
    });
  });

  it("gives every other card one shared value, so a fade re-renders one card", () => {
    expect(dropLineFor(line, "a")).toBe(NO_DROP_LINE);
    expect(dropLineFor({ ...line, visible: false }, "a")).toBe(NO_DROP_LINE);
    expect(dropLineFor({ slot: null, visible: false }, "b")).toBe(NO_DROP_LINE);
    expect(dropLineFor(undefined, "b")).toBe(NO_DROP_LINE);
  });
});
