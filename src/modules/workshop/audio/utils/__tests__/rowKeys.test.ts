import { describe, expect, it } from "vitest";

import type { AudioEvent } from "@/lib/tauri";

import { eventKey, type EventRow } from "../eventTree";
import { headIndex, movedIndex, PAGE_ROWS, treeStep } from "../rowKeys";

const EVENT: AudioEvent = {
  id: 100,
  name: "Play_sfx_Ahri_AhriQ_OnCast",
  actionCount: 1,
  mediaCount: 1,
  status: { kind: "resolved" },
  contexts: [],
  listed: null,
  nodes: [],
};

const EVENT_ROW: EventRow = {
  kind: "event",
  key: eventKey(EVENT.id),
  depth: 0,
  parent: null,
  expandable: true,
  event: EVENT,
};

const CHILD_ROW: EventRow = {
  kind: "loading",
  key: `${eventKey(EVENT.id)}/0`,
  depth: 1,
  parent: eventKey(EVENT.id),
  expandable: false,
};

describe("movedIndex", () => {
  it("moves the selection by one row and by a page, clamped to the rows", () => {
    expect(movedIndex("ArrowDown", 0, 3)).toBe(1);
    expect(movedIndex("ArrowDown", 2, 3)).toBe(2);
    expect(movedIndex("ArrowUp", -1, 3)).toBe(0);
    expect(movedIndex("PageDown", 0, PAGE_ROWS * 2)).toBe(PAGE_ROWS);
    expect(movedIndex("End", 0, 3)).toBe(2);
  });

  it("returns null for a key that moves nothing and for an empty list", () => {
    expect(movedIndex(" ", 0, 3)).toBeNull();
    expect(movedIndex("ArrowDown", -1, 0)).toBeNull();
  });
});

describe("headIndex", () => {
  const rows = [{ kind: "event" }, { kind: "voice" }, { kind: "voice" }, { kind: "event" }];

  it("returns the next or the previous head row from the index", () => {
    expect(headIndex(rows, 0, 1, "event")).toBe(3);
    expect(headIndex(rows, 2, -1, "event")).toBe(0);
    expect(headIndex(rows, 3, -1, "event")).toBe(0);
  });

  it("returns null past the last head row", () => {
    expect(headIndex(rows, 3, 1, "event")).toBeNull();
    expect(headIndex(rows, 0, -1, "event")).toBeNull();
  });
});

describe("treeStep", () => {
  it("expands a closed event on ArrowRight", () => {
    expect(treeStep("ArrowRight", [EVENT_ROW], 0, new Set())).toEqual({
      kind: "expand",
      key: EVENT_ROW.key,
      open: true,
    });
  });

  it("selects the first child of an open event on ArrowRight", () => {
    const rows = [EVENT_ROW, CHILD_ROW];

    expect(treeStep("ArrowRight", rows, 0, new Set([EVENT_ROW.key]))).toEqual({
      kind: "select",
      index: 1,
    });
  });

  it("collapses an open event and selects the parent of a child on ArrowLeft", () => {
    const rows = [EVENT_ROW, CHILD_ROW];
    const expanded = new Set([EVENT_ROW.key]);

    expect(treeStep("ArrowLeft", rows, 0, expanded)).toEqual({
      kind: "expand",
      key: EVENT_ROW.key,
      open: false,
    });
    expect(treeStep("ArrowLeft", rows, 1, expanded)).toEqual({ kind: "select", index: 0 });
  });

  it("returns null for a leaf on ArrowRight and for another key", () => {
    expect(treeStep("ArrowRight", [EVENT_ROW, CHILD_ROW], 1, new Set())).toBeNull();
    expect(treeStep("Enter", [EVENT_ROW], 0, new Set())).toBeNull();
  });
});
