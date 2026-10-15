import { describe, expect, it } from "vitest";

import { nameHash } from "../../../../shared/utils/binHash";
import { emitterOf } from "../../../engine/simulation/__tests__/emitterFixture";
import { flagEdits, setsDisabled } from "../emitterFlags";

const COMPLEX = nameHash("complexEmitterDefinitionData").slice(2);
const SIMPLE = nameHash("simpleEmitterDefinitionData").slice(2);

describe("flagEdits", () => {
  const emitters = [
    emitterOf(0, { listIndex: 0 }),
    emitterOf(1, { listIndex: 1 }),
    emitterOf(2, { simple: true, listIndex: 0 }),
  ];

  it("returns an edit per emitter whose membership changes, writing its new flag", () => {
    const edits = flagEdits(emitters, "0x1", new Set([1]), new Set([0, 2]));

    expect(edits.map((edit) => [edit.holder, edit.edits])).toEqual([
      [`${COMPLEX}[0]`, [{ type: "setLeaf", path: "", value: { type: "bool", value: true } }]],
      [`${COMPLEX}[1]`, [{ type: "setLeaf", path: "", value: { type: "bool", value: false } }]],
      [`${SIMPLE}[0]`, [{ type: "setLeaf", path: "", value: { type: "bool", value: true } }]],
    ]);
    expect(edits.every((edit) => edit.entry === "0x1" && edit.field === nameHash("disabled"))).toBe(
      true,
    );
  });

  it("returns no edit if the set is unchanged", () => {
    expect(flagEdits(emitters, "0x1", new Set([1]), new Set([1]))).toEqual([]);
  });
});

describe("setsDisabled", () => {
  it("returns true for an emitter whose own flag hides it, and false for an engine gate", () => {
    expect(setsDisabled(emitterOf(0, { disabled: true, culled: null }))).toBe(true);
    expect(setsDisabled(emitterOf(0, { disabled: true, culled: "importance" }))).toBe(false);
    expect(setsDisabled(emitterOf(0, { disabled: false }))).toBe(false);
  });
});
