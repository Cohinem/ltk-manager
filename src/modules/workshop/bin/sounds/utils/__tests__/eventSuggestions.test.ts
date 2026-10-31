import { describe, expect, it } from "vitest";

import type { BinRow, ScopedEvents } from "@/lib/tauri";

import { eventGroups, GAME_GROUP, isSoundField, unitOfGroup } from "../eventSuggestions";

const SCOPED: ScopedEvents[] = [
  {
    unit: "Lux_Skin07_SFX",
    bin: "data/characters/lux/skins/skin7.bin",
    events: ["Play_sfx_LuxSkin07_LuxQ_OnCast", "Play_sfx_LuxSkin07_LuxR_hit"],
  },
  {
    unit: "Lux_Base_SFX",
    bin: "data/characters/lux/skins/skin0.bin",
    events: ["Play_sfx_Lux_LuxQ_OnCast", "Play_sfx_LuxSkin07_LuxQ_OnCast"],
  },
];

function row(name: string, value: BinRow["value"], unnamed = false): BinRow {
  return {
    entry: "0x00000001",
    path: "00000002",
    label: name,
    node: "property",
    name,
    unnamed,
    kind: "string",
    value,
    declared: null,
  };
}

describe("eventGroups", () => {
  it("lists every scoped unit while the draft has no query, without the game group", () => {
    const groups = eventGroups(SCOPED, ["Play_sfx_Other"], null, "Play_sfx_Lux_LuxQ_OnCast");

    expect(groups.map((group) => unitOfGroup(group.value))).toEqual([
      "Lux_Skin07_SFX",
      "Lux_Base_SFX",
    ]);
    expect(groups[1]?.items).toEqual([{ name: "Play_sfx_Lux_LuxQ_OnCast", current: true }]);
  });

  it("keeps the names that contain every term, and the game's names no unit lists", () => {
    const groups = eventGroups(
      SCOPED,
      ["Play_sfx_Lux_LuxQ_OnCast", "Play_sfx_Ezreal_EzrealQ_OnCast"],
      "luxq oncast",
      "",
    );

    expect(groups.map((group) => group.items.map((item) => item.name))).toEqual([
      ["Play_sfx_LuxSkin07_LuxQ_OnCast"],
      ["Play_sfx_Lux_LuxQ_OnCast"],
    ]);
    expect(eventGroups(SCOPED, ["Play_sfx_Ezreal_Q"], "ezreal", "")[0]?.value).toBe(GAME_GROUP);
  });
});

describe("isSoundField", () => {
  it("returns true for a named string property of a sound field", () => {
    expect(isSoundField(row("mSoundName", { type: "string", value: "" }))).toBe(true);
    expect(isSoundField(row("SoundPersistent", { type: "string", value: "x" }))).toBe(true);
  });

  it("returns false for another property or an unnamed hash", () => {
    expect(isSoundField(row("mAnimationName", { type: "string", value: "" }))).toBe(false);
    expect(isSoundField(row("mSoundName", { type: "string", value: "" }, true))).toBe(false);
  });
});
