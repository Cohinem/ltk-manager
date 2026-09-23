import { describe, expect, it } from "vitest";

import type { CharacterSpell } from "@/lib/tauri";

import { characterOf, spellGroups } from "../catalog";

function spell(name: string, group: string | null): CharacterSpell {
  return {
    objectHash: name,
    name,
    group,
    path: `Characters/Sejuani/Spells/${name}`,
    declarations: [],
  };
}

describe("characterOf", () => {
  it("uses whole path segments and leaves unnamed objects unresolved", () => {
    expect(characterOf("Characters/Sejuani/Skins/Skin0")).toBe("Sejuani");
    expect(characterOf("characters/sejuani/spells/E")).toBe("sejuani");
    expect(characterOf("CharactersExtra/Sejuani/Skins/Skin0")).toBeNull();
    expect(characterOf("Characters//Skins/Skin0")).toBeNull();
    expect(characterOf("0x12345678")).toBeNull();
  });
});

describe("spellGroups", () => {
  it("keeps flat spells and merges case variants without changing spell order", () => {
    const spells = [spell("E/First", "E"), spell("e/Second", "e"), spell("Flat", null)];
    expect(spellGroups(spells, "")).toEqual([
      { name: "E", spells: spells.slice(0, 2) },
      { name: null, spells: spells.slice(2) },
    ]);
    expect(spellGroups(spells, " second ")).toEqual([{ name: "e", spells: [spells[1]] }]);
    expect(spellGroups(spells, "missing")).toEqual([]);
  });
});
