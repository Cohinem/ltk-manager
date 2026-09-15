import { describe, expect, it } from "vitest";

import type { BinRow } from "@/lib/tauri";

import { keyEdit, onHover, rowEdits } from "../rowEdits";

function row(overrides: Partial<BinRow>): BinRow {
  return {
    entry: "0x2a1f3c7d",
    path: "0000000a",
    label: "scale",
    node: "property",
    name: "scale",
    unnamed: false,
    kind: "f32",
    value: { type: "float", value: 1.5 },
    declared: null,
    ...overrides,
  };
}

const LIST = row({ kind: "list", value: { type: "container", len: 3, itemKind: "f32" } });
const item = (index: number) =>
  rowEdits({ row: row({ node: "element", path: `0000000a[${index}]` }), parent: LIST, index });

describe("rowEdits", () => {
  it("offers a list its add, and an item its insert, its moves and its remove", () => {
    expect(rowEdits({ row: LIST, parent: null, index: 0 })).toEqual(["addItem", "removeProperty"]);
    expect(item(1)).toEqual(["insertAfter", "moveUp", "moveDown", "removeItem"]);
    expect(item(0)).not.toContain("moveUp");
    expect(item(2)).not.toContain("moveDown");
  });

  it("offers an entry its insert and its remove", () => {
    const map = row({
      kind: "map",
      value: { type: "map", len: 1, keyKind: "hash", valueKind: "f32" },
    });
    expect(rowEdits({ row: row({ node: "entry" }), parent: map, index: 0 })).toEqual([
      "insertAfter",
      "removeEntry",
    ]);
  });

  it("sets an absent option and clears a present one, inline or not", () => {
    const absent = row({
      kind: "option",
      value: { type: "optional", present: false, itemKind: "f32" },
    });
    const present = row({
      kind: "option",
      value: { type: "optional", present: true, itemKind: "embed" },
    });
    expect(rowEdits({ row: absent, parent: null, index: 0 })).toContain("setValue");
    expect(rowEdits({ row: absent, parent: null, index: 0 })).not.toContain("clearValue");
    expect(rowEdits({ row: row({ kind: "option" }), parent: null, index: 0 })).toContain(
      "clearValue",
    );
    expect(
      rowEdits({ row: row({ node: "element", kind: "embed" }), parent: present, index: 0 }),
    ).toEqual(["clearValue"]);
  });

  it("gives a null pointer a class and a held one a way to null", () => {
    const held = row({
      kind: "pointer",
      value: { type: "struct", classHash: "0x1", class: null, len: 0 },
    });
    expect(
      rowEdits({ row: row({ kind: "pointer", value: { type: "null" } }), parent: null, index: 0 }),
    ).toEqual(["setClass", "removeProperty"]);
    expect(rowEdits({ row: held, parent: null, index: 0 })).toEqual([
      "addProperty",
      "setNull",
      "removeProperty",
    ]);
  });

  it("keeps a move and a null in the menu", () => {
    expect(onHover("moveUp")).toBe(false);
    expect(onHover("setNull")).toBe(false);
    expect(onHover("insertAfter")).toBe(true);
  });
});

describe("keyEdit", () => {
  const keys = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };

  it("reads Alt+Up and Alt+Down as moves and Ctrl+Enter as an insert, where the row offers them", () => {
    expect(keyEdit({ ...keys, key: "ArrowUp", altKey: true }, item(1))).toBe("moveUp");
    expect(keyEdit({ ...keys, key: "ArrowDown", altKey: true }, item(1))).toBe("moveDown");
    expect(keyEdit({ ...keys, key: "Enter", ctrlKey: true }, item(1))).toBe("insertAfter");
    expect(keyEdit({ ...keys, key: "ArrowUp", altKey: true }, item(0))).toBeNull();
    expect(keyEdit({ ...keys, key: "Enter" }, item(1))).toBeNull();
  });
});
