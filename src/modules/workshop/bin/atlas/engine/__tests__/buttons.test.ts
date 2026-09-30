import { describe, expect, it } from "vitest";

import { buttonsFirst, buttonStateOf, type ViewButton } from "../model/buttons";
import { buildTree } from "../model/tree";
import { element, icon, scene, view } from "./fixtures";

const BUTTON: ViewButton = {
  hitRegion: null,
  textSizeInHitRegion: false,
  selected: false,
  enabled: true,
  active: true,
  clickParticle: null,
  tooltip: null,
  inactiveTooltip: null,
  selectedTooltip: null,
};

const REST = { hovered: false, pressed: false };

describe("buttonStateOf", () => {
  it("draws pressed over hovered over resting", () => {
    expect(buttonStateOf(BUTTON, REST)).toBe("DefaultStateElements");
    expect(buttonStateOf(BUTTON, { hovered: true, pressed: false })).toBe("HoverStateElements");
    expect(buttonStateOf(BUTTON, { hovered: true, pressed: true })).toBe("ClickedStateElements");
  });

  it("draws each in its selected form on a selected button", () => {
    const selected = { ...BUTTON, selected: true };

    expect(buttonStateOf(selected, REST)).toBe("SelectedStateElements");
    expect(buttonStateOf(selected, { hovered: true, pressed: false })).toBe(
      "SelectedHoverStateElements",
    );
    expect(buttonStateOf(selected, { hovered: true, pressed: true })).toBe(
      "SelectedClickedStateElements",
    );
  });

  it("draws an inactive button inactive whatever the pointer does", () => {
    const inactive = { ...BUTTON, active: false };

    expect(buttonStateOf(inactive, { hovered: true, pressed: true })).toBe("InactiveStateElements");
    expect(buttonStateOf({ ...inactive, selected: true }, REST)).toBe(
      "InactiveSelectedStateElements",
    );
  });
});

describe("buttonsFirst", () => {
  const group = element("button", "s", 0, {
    kind: "group",
    children: ["normal", "hover"],
    states: [
      { state: "DefaultStateElements", elements: ["normal"], text: null, textFrame: null },
      { state: "HoverStateElements", elements: ["hover"], text: null, textFrame: null },
    ],
    alpha: 1,
    layout: null,
    button: BUTTON,
    meter: null,
  });
  const tree = buildTree(
    view(
      [scene("s", 0)],
      [
        group,
        element("normal", "s", 1, icon()),
        element("hover", "s", 2, icon()),
        element("backdrop", "s", 3, icon()),
      ],
    ),
  );

  it("puts a button before the first of its elements under the pointer", () => {
    expect(buttonsFirst(tree, ["hover", "normal", "backdrop"])).toEqual([
      "button",
      "hover",
      "normal",
      "backdrop",
    ]);
  });

  it("keeps a button the pointer is over itself where it is, once", () => {
    expect(buttonsFirst(tree, ["backdrop", "button", "normal"])).toEqual([
      "backdrop",
      "button",
      "normal",
    ]);
  });
});
