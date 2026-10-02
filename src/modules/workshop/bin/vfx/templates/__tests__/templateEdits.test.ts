import { describe, expect, it } from "vitest";

import { nameHash } from "../../../shared/utils/binHash";
import { freeName, landingEdits } from "../templateEdits";

const NAME = nameHash("emitterName");

describe("freeName", () => {
  it("keeps a name nothing holds", () => {
    expect(freeName(new Set(["Glow"]), "Sparks")).toBe("Sparks");
  });

  it("numbers a taken name from two", () => {
    expect(freeName(new Set(["Sparks"]), "Sparks")).toBe("Sparks2");
    expect(freeName(new Set(["Sparks", "Sparks2"]), "Sparks")).toBe("Sparks3");
  });
});

describe("landingEdits", () => {
  it("pastes each emitter at its own index and names it apart from the system", () => {
    const edits = landingEdits(
      [
        { name: "Sparks", text: "a" },
        { name: "Sparks", text: "b" },
      ],
      4,
      new Set(["Sparks"]),
    );

    expect(edits).toEqual([
      { type: "pasteItem", path: "", index: 4, text: "a", unique: null },
      {
        type: "setLeaf",
        path: `[4].${NAME.slice(2)}`,
        value: { type: "string", value: "Sparks2" },
      },
      { type: "pasteItem", path: "", index: 5, text: "b", unique: null },
      {
        type: "setLeaf",
        path: `[5].${NAME.slice(2)}`,
        value: { type: "string", value: "Sparks3" },
      },
    ]);
  });
});
