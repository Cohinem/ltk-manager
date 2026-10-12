import { describe, expect, it } from "vitest";

import type { VfxObject } from "@/lib/tauri";

import { addGroups, addItems, type NamedStart } from "../childAdd";

const SYSTEMS: VfxObject[] = [
  { entry: "0x00000001", name: "Particles/Orb" },
  { entry: "0x00000002", name: "Particles/Orb_Sparks" },
  { entry: "0x00000003", name: null },
];

const STARTS: NamedStart[] = [{ start: { kind: "blank" }, label: "Blank" }];

const ITEMS = addItems(SYSTEMS, STARTS, "0x00000001");

describe("addItems", () => {
  it("lists every system but the emitter's own, an unnamed one by its entry", () => {
    expect(ITEMS.filter((item) => item.kind === "link")).toEqual([
      { kind: "link", id: "link:0x00000002", entry: "0x00000002", path: "Particles/Orb_Sparks" },
      { kind: "link", id: "link:0x00000003", entry: "0x00000003", path: "0x00000003" },
    ]);
  });

  it("offers the starts of a new system before the systems have been read", () => {
    expect(addItems(undefined, STARTS, "0x00000001")).toEqual([
      { kind: "new", id: "new:0", ...STARTS[0] },
    ]);
  });
});

describe("addGroups", () => {
  it("sections the entries as effects and then new effect", () => {
    expect(addGroups(ITEMS, "").map((group) => [group.value, group.items.length])).toEqual([
      ["link", 2],
      ["new", 1],
    ]);
  });

  it("narrows both sections to the entries that contain each typed word", () => {
    const groups = addGroups(ITEMS, "orb SPARKS");

    expect(groups.map((group) => [group.value, group.items.map((item) => item.id)])).toEqual([
      ["link", ["link:0x00000002"]],
    ]);
  });

  it("answers no section for text nothing contains", () => {
    expect(addGroups(ITEMS, "zzz")).toEqual([]);
  });
});
