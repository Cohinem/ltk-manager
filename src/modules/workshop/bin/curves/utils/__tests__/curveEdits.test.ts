import { describe, expect, it, vi } from "vitest";

import type { BinRow, ValueEdit } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import type { LeafEdit } from "../../../tree/hooks/useLeafEdit";
import {
  commitCurveKey,
  curveActivationEdits,
  curveDynamicsClass,
  insertionIndex,
  insertCurveKey,
  removeCurveKey,
  removeCurveKeys,
  suggestedCurveKey,
} from "../curveEdits";

const ROW = {
  entry: "0x00000001",
  path: "a7084719",
  label: "rate",
  node: "property",
  name: "rate",
  unnamed: false,
  kind: null,
  declared: null,
  value: { type: "struct", classHash: nameHash("ValueFloat"), class: "ValueFloat", len: 2 },
} satisfies BinRow;

function editor() {
  const editProperty = vi.fn<
    (holder: BinRow, field: string, edits: ValueEdit[]) => Promise<boolean>
  >(async () => true);
  const edit: LeafEdit = { commit: vi.fn(), refused: new Map(), editProperty };
  return { edit, editProperty };
}

describe("curve edits", () => {
  it("selects the current animated class for every value family", () => {
    expect(curveDynamicsClass(nameHash("ValueFloat"))).toBe("VfxAnimatedFloat");
    expect(curveDynamicsClass(nameHash("ValueVector2"))).toBe("VfxAnimatedVector2f");
    expect(curveDynamicsClass(nameHash("ValueVector3"))).toBe("VfxAnimatedVector3f");
    expect(curveDynamicsClass(nameHash("ValueColor"))).toBe("VfxAnimatedColor");
    expect(curveDynamicsClass(nameHash("ValueColorRgb"))).toBe("0x8152c1ec");
    expect(curveDynamicsClass(nameHash("ValueInt"))).toBeNull();
  });

  it("updates a key's time and value in one property edit", async () => {
    const { edit, editProperty } = editor();

    await commitCurveKey(edit, ROW, "scalar", 1, { time: 0.75, values: [4] });

    expect(editProperty).toHaveBeenCalledWith(ROW, nameHash("dynamics"), [
      {
        type: "setLeaf",
        path: `${nameHash("times").slice(2)}[1]`,
        value: { type: "float", value: 0.75 },
      },
      {
        type: "setLeaf",
        path: `${nameHash("values").slice(2)}[1]`,
        value: { type: "float", value: 4 },
      },
    ]);
  });

  it("seeds a flat two-key curve from the current value", () => {
    const edits = curveActivationEdits(
      nameHash("ValueVector3"),
      { type: "vector", values: [2, 3, 4] },
      "value",
    );

    expect(edits?.slice(0, 4)).toEqual([
      { type: "ensureProperty", path: "", field: nameHash("dynamics") },
      {
        type: "ensurePointer",
        path: nameHash("dynamics").slice(2),
        class: "VfxAnimatedVector3f",
      },
      {
        type: "ensureProperty",
        path: nameHash("dynamics").slice(2),
        field: nameHash("times"),
      },
      {
        type: "ensureProperty",
        path: nameHash("dynamics").slice(2),
        field: nameHash("values"),
      },
    ]);
    expect(edits?.filter((edit) => edit.type === "setLeaf")).toEqual([
      {
        type: "setLeaf",
        path: `${nameHash("dynamics").slice(2)}.${nameHash("times").slice(2)}[0]`,
        value: { type: "float", value: 0 },
      },
      {
        type: "setLeaf",
        path: `${nameHash("dynamics").slice(2)}.${nameHash("values").slice(2)}[0]`,
        value: { type: "vector", values: [2, 3, 4] },
      },
      {
        type: "setLeaf",
        path: `${nameHash("dynamics").slice(2)}.${nameHash("times").slice(2)}[1]`,
        value: { type: "float", value: 1 },
      },
      {
        type: "setLeaf",
        path: `${nameHash("dynamics").slice(2)}.${nameHash("values").slice(2)}[1]`,
        value: { type: "vector", values: [2, 3, 4] },
      },
    ]);
  });

  it("inserts matching vector items at the requested position", async () => {
    const { edit, editProperty } = editor();

    await insertCurveKey(edit, ROW, "vector", 1, { time: 0.5, values: [1, 2, 3] });

    const edits = editProperty.mock.calls[0]?.[2] ?? [];
    expect(edits.filter((item) => item.type === "insertItem")).toEqual([
      {
        type: "insertItem",
        path: nameHash("times").slice(2),
        item: { index: 1, key: null, class: null },
      },
      {
        type: "insertItem",
        path: nameHash("values").slice(2),
        item: { index: 1, key: null, class: null },
      },
    ]);
    expect(edits.at(-1)).toEqual({
      type: "setLeaf",
      path: `${nameHash("values").slice(2)}[1]`,
      value: { type: "vector", values: [1, 2, 3] },
    });
  });

  it("removes matching time and value items in one property edit", async () => {
    const { edit, editProperty } = editor();

    await removeCurveKey(edit, ROW, 2);

    expect(editProperty).toHaveBeenCalledWith(ROW, nameHash("dynamics"), [
      { type: "removeItem", path: `${nameHash("times").slice(2)}[2]` },
      { type: "removeItem", path: `${nameHash("values").slice(2)}[2]` },
    ]);
  });

  it("removes multiple keys from the end in one property edit", async () => {
    const { edit, editProperty } = editor();

    await removeCurveKeys(edit, ROW, [0, 2, 1]);

    expect(editProperty).toHaveBeenCalledWith(ROW, nameHash("dynamics"), [
      { type: "removeItem", path: `${nameHash("times").slice(2)}[2]` },
      { type: "removeItem", path: `${nameHash("values").slice(2)}[2]` },
      { type: "removeItem", path: `${nameHash("times").slice(2)}[1]` },
      { type: "removeItem", path: `${nameHash("values").slice(2)}[1]` },
      { type: "removeItem", path: `${nameHash("times").slice(2)}[0]` },
      { type: "removeItem", path: `${nameHash("values").slice(2)}[0]` },
    ]);
  });

  it("places a new key in time order and samples its starting value", () => {
    const keys = [
      { time: 0, values: [0] },
      { time: 1, values: [10] },
    ];
    const suggested = suggestedCurveKey(keys, null, "scalar", 0);

    expect(suggested).toEqual({ time: 0.5, values: [5] });
    expect(insertionIndex(keys, suggested.time)).toBe(1);
  });
});
