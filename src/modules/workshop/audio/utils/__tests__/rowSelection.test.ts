import { describe, expect, it } from "vitest";

import { keepDrawn, NO_SELECTION, pickMode, pickRow, selectAll } from "../rowSelection";

const ORDER = ["a", "b", "c", "d", "e"];

function keys(selection: { keys: ReadonlySet<string> }) {
  return [...selection.keys].sort();
}

describe("pickMode", () => {
  it("returns range for Shift and toggle for Ctrl or Cmd", () => {
    expect(pickMode({ ctrlKey: false, metaKey: false, shiftKey: true })).toBe("range");
    expect(pickMode({ ctrlKey: true, metaKey: false, shiftKey: false })).toBe("toggle");
    expect(pickMode({ ctrlKey: false, metaKey: true, shiftKey: false })).toBe("toggle");
    expect(pickMode({ ctrlKey: false, metaKey: false, shiftKey: false })).toBe("only");
  });
});

describe("pickRow", () => {
  it("picks one row in place of the selection", () => {
    const picked = pickRow(pickRow(NO_SELECTION, "a", ORDER, "only"), "c", ORDER, "only");

    expect(keys(picked)).toEqual(["c"]);
    expect(picked.anchor).toBe("c");
  });

  it("flips one row on toggle and keeps the others", () => {
    const one = pickRow(NO_SELECTION, "a", ORDER, "only");
    const two = pickRow(one, "c", ORDER, "toggle");
    const back = pickRow(two, "a", ORDER, "toggle");

    expect(keys(two)).toEqual(["a", "c"]);
    expect(keys(back)).toEqual(["c"]);
  });

  it("takes the rows from the anchor to the row on range, either way round", () => {
    const anchored = pickRow(NO_SELECTION, "d", ORDER, "only");

    expect(keys(pickRow(anchored, "b", ORDER, "range"))).toEqual(["b", "c", "d"]);
    expect(keys(pickRow(anchored, "e", ORDER, "range"))).toEqual(["d", "e"]);
  });

  it("moves the far end of a range instead of adding a second range", () => {
    const anchored = pickRow(NO_SELECTION, "b", ORDER, "only");
    const wide = pickRow(anchored, "e", ORDER, "range");
    const narrow = pickRow(wide, "c", ORDER, "range");

    expect(keys(narrow)).toEqual(["b", "c"]);
  });

  it("adds a range to the picks that a toggle made", () => {
    const one = pickRow(NO_SELECTION, "a", ORDER, "only");
    const two = pickRow(one, "d", ORDER, "toggle");
    const range = pickRow(two, "e", ORDER, "range");

    expect(keys(range)).toEqual(["a", "d", "e"]);
  });

  it("picks the row alone if the anchor is not drawn", () => {
    const anchored = pickRow(NO_SELECTION, "x", ORDER, "only");

    expect(keys(pickRow(anchored, "c", ORDER, "range"))).toEqual(["c"]);
  });
});

describe("selectAll", () => {
  it("picks every drawn row", () => {
    expect(keys(selectAll(ORDER, "a"))).toEqual(ORDER);
  });
});

describe("keepDrawn", () => {
  it("drops the picks that the tree no longer draws", () => {
    const all = selectAll(ORDER, "e");

    const kept = keepDrawn(all, ["a", "b"]);

    expect(keys(kept)).toEqual(["a", "b"]);
    expect(kept.anchor).toBeNull();
  });

  it("returns the same selection if every pick is drawn", () => {
    const picked = pickRow(NO_SELECTION, "a", ORDER, "only");

    expect(keepDrawn(picked, ORDER)).toBe(picked);
  });
});
