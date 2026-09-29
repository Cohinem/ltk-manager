import { describe, expect, it } from "vitest";

import { sampleText } from "../text/samples";

describe("sampleText", () => {
  it("reads a sample of the kind the element's name suggests", () => {
    expect(sampleText("RespawnTimerText", null, "0x1")).toBe("1:24");
    expect(sampleText("ClientStates/Gameplay/UX/Shop/ItemCost", null, "0x1")).toBe("1,250");
    expect(sampleText("ChampionLevel", null, "0x1")).toBe("18");
    expect(sampleText("KDA_Text", null, "0x1")).toBe("5 / 2 / 7");
    expect(sampleText("", "UX/Hud/Spell_Q_HotkeyLabel", "0x1")).toBe("Q");
  });

  it("reads the name in words where no kind matches, without its text suffix", () => {
    expect(sampleText("ClientStates/Gameplay/UX/Options/WindowModeLabel", null, "0x1")).toBe(
      "Window mode",
    );
    expect(sampleText("title", null, "0x1")).toBe("Title");
  });

  it("reads the key where the element has no name", () => {
    expect(sampleText("", null, "0x0badf00d")).toBe("0x0badf00d");
  });
});
