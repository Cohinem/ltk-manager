import { describe, expect, it } from "vitest";

import type { SoundTarget } from "@/lib/tauri";

import { matchingTargets, targetLabel } from "../soundTargets";

function target(object: string, label: string, value = ""): SoundTarget {
  return {
    row: {
      asset: null,
      bin: "data/characters/ahri/skins/skin0.bin",
      objectHash: "0x00000001",
      object,
      classHash: "0x00000002",
      class: "AnimationGraphData",
      property: { path: "0", label },
    },
    holder: "",
    field: "0x00000003",
    value,
  };
}

describe("targetLabel", () => {
  it("joins the object and the field path", () => {
    expect(targetLabel(target("Ahri/Animations", "mClipDataMap{Run}.mSoundName"))).toBe(
      "Ahri/Animations mClipDataMap{Run}.mSoundName",
    );
  });
});

describe("matchingTargets", () => {
  it("keeps the targets that contain every word, without case", () => {
    const run = target("Ahri/Animations", "mClipDataMap{Run}.mSoundName");
    const idle = target("Ahri/Animations", "mClipDataMap{Idle}.mSoundName");

    expect(matchingTargets([run, idle], "ahri run")).toEqual([run]);
  });

  it("lists the empty fields before the set ones", () => {
    const set = target("A", "x", "Play_a");
    const empty = target("B", "y");

    expect(matchingTargets([set, empty], "")).toEqual([empty, set]);
  });
});
