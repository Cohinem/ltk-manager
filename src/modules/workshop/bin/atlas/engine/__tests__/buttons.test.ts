import { describe, expect, it } from "vitest";

import { buttonStateOf, type ViewButton } from "../model/buttons";

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
