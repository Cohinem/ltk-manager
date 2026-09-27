import { describe, expect, it } from "vitest";

import { nameHash } from "../../../../shared/utils/binHash";
import { emitterDropEdit } from "../assetDrops";
import { freeName, matching, newEmitterEdits } from "../QuickAdd";

const entry = (text: string, section: string) => ({ key: text, text, section, pick: () => {} });

describe("the quick add", () => {
  it("keeps the entries every typed word is found in, by text or section", () => {
    const entries = [
      entry("Rate", "Emission"),
      entry("Birth color", "Color"),
      entry("Drag", "Forces"),
    ];

    expect(matching(entries, "").map((each) => each.text)).toEqual(["Rate", "Birth color", "Drag"]);
    expect(matching(entries, "col bir").map((each) => each.text)).toEqual(["Birth color"]);
    expect(matching(entries, "forces").map((each) => each.text)).toEqual(["Drag"]);
  });

  it("names a new emitter past every name the system holds", () => {
    expect(freeName(new Set(["Emitter1", "Emitter2", "Glow"]))).toBe("Emitter3");
  });

  it("appends a new emitter and names it at the index it lands at", () => {
    const edits = newEmitterEdits(4, "Emitter1");

    expect(edits[0]).toMatchObject({ type: "insertItem", path: "" });
    expect(edits.at(-1)).toEqual({
      type: "setLeaf",
      path: `[4].${nameHash("emitterName").slice(2)}`,
      value: { type: "string", value: "Emitter1" },
    });
  });
});

describe("a path dropped on an emitter", () => {
  it("sets the texture, puts a mesh in a mesh primitive, and leaves any other file", () => {
    expect(emitterDropEdit("assets/fx/glow.tex")?.field).toBe(nameHash("texture"));

    const mesh = emitterDropEdit("assets/fx/ring.scb");
    expect(mesh?.field).toBe(nameHash("primitive"));
    expect(mesh?.edits[0]).toEqual({
      type: "replacePointer",
      path: "",
      class: nameHash("VfxPrimitiveMesh"),
    });

    expect(emitterDropEdit("data/fx/other.bin")).toBeNull();
  });
});
