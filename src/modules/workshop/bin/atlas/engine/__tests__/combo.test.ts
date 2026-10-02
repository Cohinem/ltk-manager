import { describe, expect, it } from "vitest";

import type { PixelRect } from "../layout/solve";
import {
  type ComboBox,
  comboButtons,
  type ComboInputs,
  comboOf,
  comboOverlay,
  type ComboState,
} from "../model/combo";
import { buildTree } from "../model/tree";
import type { ViewLook } from "../model/view";
import { element, icon, scene, view } from "./fixtures";

const TEXT = { kind: "text" } as ViewLook;

function group(children: string[]): ViewLook {
  return {
    kind: "group",
    children,
    states: [],
    alpha: 1,
    layout: null,
    button: null,
    meter: null,
  } as ViewLook;
}

const COMBO: ComboBox = {
  key: "combo",
  path: null,
  button: "button",
  backdrop: "backdrop",
  hover: "hover",
  highlight: "highlight",
  optionText: "text",
  optionHitArea: "hit",
  upward: false,
  labelKey: null,
  selectionSound: null,
};

const tree = buildTree(
  view(
    [scene("s", 0)],
    [
      element("button", "s", 0, group(["label"]), null),
      element("label", "s", 1, TEXT),
      element("backdrop", "s", 2, icon()),
      element("hover", "s", 3, icon()),
      element("highlight", "s", 4, icon()),
      element("text", "s", 5, TEXT),
      element("hit", "s", 6, { kind: "region" } as ViewLook),
    ],
  ),
);

const solved = new Map<string, PixelRect>([
  ["label", { x: 100, y: 100, w: 200, h: 30 }],
  ["backdrop", { x: 100, y: 130, w: 200, h: 36 }],
  ["hit", { x: 100, y: 134, w: 200, h: 28 }],
  ["text", { x: 110, y: 138, w: 180, h: 20 }],
  ["hover", { x: 100, y: 134, w: 200, h: 28 }],
  ["highlight", { x: 100, y: 134, w: 200, h: 28 }],
]);

const INPUTS: ComboInputs = {
  tree,
  solved,
  string: (key) => (key === "items_label" ? "Set: @Name@" : null),
  optionName: (option) => `Option ${option + 1}`,
};

function laid(state: ComboState, combo = COMBO, hovered: number | null = null) {
  return comboOverlay(
    [combo],
    () => state,
    hovered === null ? null : { combo: combo.key, option: hovered },
    INPUTS,
  );
}

describe("comboOverlay", () => {
  it("draws the list's parts off while closed, and the button reads the selected option", () => {
    const overlay = laid({ open: false, options: 3, selected: 1 });

    expect([...overlay.hidden].sort()).toEqual(["backdrop", "highlight", "hit", "hover", "text"]);
    expect(overlay.clones).toEqual([]);
    expect(overlay.texts.get("label")).toBe("Option 2");
  });

  it("clones a row per option a row's height apart, and grows the backdrop to hold them", () => {
    const overlay = laid({ open: true, options: 3, selected: 1 }, COMBO, 2);

    expect(overlay.clones.map((clone) => [clone.rect.y, clone.text])).toEqual([
      [138, "Option 1"],
      [166, "Option 2"],
      [194, "Option 3"],
    ]);
    expect(overlay.moved.get("backdrop")).toEqual({ x: 100, y: 130, w: 200, h: 92 });
    expect(overlay.moved.get("highlight")?.y).toBe(162);
    expect(overlay.moved.get("hover")?.y).toBe(190);
    expect(overlay.hidden.has("text")).toBe(true);
    expect(overlay.shown.has("backdrop")).toBe(true);
  });

  it("stacks an upward list above the button with the first option on top", () => {
    const overlay = laid({ open: true, options: 3, selected: 0 }, { ...COMBO, upward: true });

    expect(overlay.rows.map((row) => [row.option, row.rect.y])).toEqual([
      [0, 78],
      [1, 106],
      [2, 134],
    ]);
    expect(overlay.moved.get("backdrop")).toEqual({ x: 100, y: 74, w: 200, h: 92 });
  });

  it("reads the label key with the selected option in place of @Name@", () => {
    const overlay = laid(
      { open: false, options: 3, selected: 0 },
      {
        ...COMBO,
        labelKey: "items_label",
      },
    );

    expect(overlay.texts.get("label")).toBe("Set: Option 1");
  });

  it("draws the hover and the highlight off where no row holds them", () => {
    const overlay = laid({ open: true, options: 2, selected: -1 });

    expect(overlay.hidden.has("hover")).toBe(true);
    expect(overlay.hidden.has("highlight")).toBe(true);
    expect(overlay.texts.get("label")).toBe("");
  });
});

describe("comboButtons and comboOf", () => {
  it("joins what a button holds where it has no rect of its own", () => {
    expect(comboButtons([COMBO], tree, solved)).toEqual([
      { combo: "combo", rect: { x: 100, y: 100, w: 200, h: 30 } },
    ]);
  });

  it("finds the combo box an element belongs to", () => {
    expect(comboOf([COMBO], "hover")?.key).toBe("combo");
    expect(comboOf([COMBO], "label")).toBeUndefined();
  });
});
