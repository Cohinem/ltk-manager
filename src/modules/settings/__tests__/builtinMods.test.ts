import { describe, expect, it } from "vitest";

import type { BuiltinModSettings } from "@/lib/tauri";
import { createMockSettings } from "@/test/fixtures";

import { hasBuiltinMods } from "../builtinMods";

function withBuiltinMods(builtinMods: BuiltinModSettings) {
  return createMockSettings({ builtinMods });
}

describe("hasBuiltinMods", () => {
  it("counts default ward skins, which change the game alone", () => {
    expect(hasBuiltinMods(withBuiltinMods({ defaultWardSkins: true, baseSkins: "off" }))).toBe(
      true,
    );
  });

  it("counts base skins for every champion, which change the game alone", () => {
    expect(
      hasBuiltinMods(withBuiltinMods({ defaultWardSkins: false, baseSkins: "allChampions" })),
    ).toBe(true);
  });

  it("leaves out base skins for modded champions, which only rework other mods", () => {
    expect(
      hasBuiltinMods(withBuiltinMods({ defaultWardSkins: false, baseSkins: "moddedChampions" })),
    ).toBe(false);
  });
});
