import { describe, expect, it } from "vitest";

import type { ClassChoice } from "@/lib/tauri";

import { classLabel, classSuggestions, classWire, typedKey } from "../addItem";

function choice(name: string | null, hash: string): ClassChoice {
  return { hash, name, held: false, derivesFrom: null };
}

const CHOICES = [
  choice("VfxEmitterDefinitionData", "0x00000001"),
  choice("CustomVfxData", "0x00000002"),
  choice(null, "0x00000003"),
];

describe("classSuggestions", () => {
  it("offers every choice in order while nothing is typed", () => {
    expect(classSuggestions(CHOICES, "").map(classLabel)).toEqual([
      "VfxEmitterDefinitionData",
      "CustomVfxData",
      "0x00000003",
    ]);
  });

  it("narrows to the names holding the text, the ones it starts first, and the text last", () => {
    expect(classSuggestions(CHOICES, "vfx").map(classLabel)).toEqual([
      "VfxEmitterDefinitionData",
      "CustomVfxData",
      "vfx",
    ]);
  });

  it("offers no typed class for a name a choice already has", () => {
    const suggestions = classSuggestions(CHOICES, "customvfxdata");
    expect(suggestions).toHaveLength(1);
    expect(classWire(suggestions[0])).toBe("0x00000002");
  });

  it("sends a typed class as it was typed", () => {
    const [typed] = classSuggestions([], " MyData ");
    expect(typed).toEqual({ kind: "typed", text: "MyData" });
    expect(classWire(typed)).toBe("MyData");
  });
});

describe("typedKey", () => {
  it("drops the quotes a named key is drawn in, and keeps a bare one", () => {
    expect(typedKey('"Idle"')).toBe("Idle");
    expect(typedKey(" Idle ")).toBe("Idle");
    expect(typedKey('"broken')).toBe('"broken');
  });
});
