import { describe, expect, it } from "vitest";

import type { GraphClip } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import { spellAnimation } from "../spellAnimation";

function clip(name: string, children: string[] = []): GraphClip {
  return {
    name,
    hash: nameHash(name),
    class: "AtomicClipData",
    animation: children.length
      ? null
      : { path: `${name}.anm`, asset: { kind: "file", path: `${name}.anm` } },
    track: null,
    mask: null,
    syncGroup: null,
    tickDuration: null,
    events: [],
    children: children.map((name) => ({ name, hash: nameHash(name), declared: true })),
    parameters: [],
    interruptionGroups: [],
    flags: 0,
  };
}

describe("spell animation lookup", () => {
  it("matches mAnimationName through a wrapper even when the graph key has no known name", () => {
    const leaf = clip("Spell1_Base");
    const wrapper = { ...clip("Spell1", ["Spell1_Base"]), name: "0xunknown" };
    expect(spellAnimation("spell1", [wrapper, leaf])).toBe(leaf);
  });
  it("keeps missing names, cycles and ambiguous branches unresolved", () => {
    const a = clip("A", ["B"]);
    const b = clip("B", ["A"]);
    expect(spellAnimation("A", [a, b])).toBeNull();
    expect(spellAnimation("A", [clip("A", ["B", "C"]), clip("B"), clip("C")])).toBeNull();
    expect(spellAnimation("", [clip("Attack1")])).toBeNull();
    expect(spellAnimation(null, [clip("Attack1")])).toBeNull();
    expect(spellAnimation("Missing", [clip("Attack1")])).toBeNull();
  });
});
