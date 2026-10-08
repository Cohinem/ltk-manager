import { describe, expect, it } from "vitest";

import type { MapController, MapParentMode } from "@/lib/tauri";

import {
  layerVisibility,
  layerVisible,
  mapVisibility,
  meshVisible,
  placeableVisible,
  withControllerState,
} from "../mapVisibility";

const terrain = (hash: string, layers: number): MapController => ({
  hash,
  name: null,
  rule: { kind: "named", defaultVisible: false, terrain: layers, stage: 0 },
});

const named = (hash: string, defaultVisible: boolean): MapController => ({
  hash,
  name: null,
  rule: { kind: "named", defaultVisible, terrain: 0, stage: 0 },
});

const child = (hash: string, mode: MapParentMode, parents: string[]): MapController => ({
  hash,
  name: null,
  rule: { kind: "child", parents, mode },
});

/**
 * Controllers of `base_srx.materials.bin` at 16.20 with their real path hashes: the six
 * terrain controllers, the four Baron stage controllers and the children that depend on
 * them.
 */
const SUMMONERS_RIFT: MapController[] = [
  terrain("0x8e6a128e", 64),
  terrain("0x4f0b2a3e", 16),
  terrain("0x48106271", 4),
  terrain("0xd1a17399", 2),
  terrain("0x2b8dbdee", 32),
  terrain("0x3c5b24f7", 8),
  child("0x5e652742", "none", [
    "0x8e6a128e",
    "0x4f0b2a3e",
    "0x48106271",
    "0xd1a17399",
    "0x2b8dbdee",
    "0x3c5b24f7",
  ]),
  named("0xca63c5fe", true),
  child("0x37c78f25", "all", ["0xca63c5fe", "0x3c5b24f7"]),
  child("0x7af438ae", "any", ["0x48106271", "0xd1a17399"]),
  named("0x1b3399aa", false),
  named("0x68fe7644", false),
  named("0xc11c84e8", false),
  named("0xf4968631", true),
  child("0x21d36b37", "none", ["0x1b3399aa"]),
  child("0xa7b30f31", "any", ["0xf4968631", "0x68fe7644"]),
  { hash: "0x76c50391", name: null, rule: { kind: "mutator", name: "SR_Hall_Of_Legends" } },
];

function visible(controllers: readonly MapController[], flags: number): string[] {
  return [...mapVisibility(controllers, flags).controllers]
    .filter(([, state]) => state)
    .map(([hash]) => hash);
}

describe("mapVisibility", () => {
  it("shows the base terrain and the base Baron stage of Summoner's Rift under layer 0", () => {
    expect(visible(SUMMONERS_RIFT, 0b0000_0001)).toEqual([
      "0x5e652742",
      "0xca63c5fe",
      "0xf4968631",
      "0x21d36b37",
      "0xa7b30f31",
    ]);
  });

  it("shows a terrain controller and hides the base terrain when the terrain's layer is active", () => {
    const ocean = visible(SUMMONERS_RIFT, 0b0000_1000);

    expect(ocean).toContain("0x3c5b24f7");
    expect(ocean).toContain("0x37c78f25");
    expect(ocean).not.toContain("0x5e652742");
  });

  it("shows a named controller with no terrain by DefaultVisible under any flags", () => {
    const controllers = [named("0x00000001", true), named("0x00000002", false)];

    expect(visible(controllers, 0)).toEqual(["0x00000001"]);
    expect(visible(controllers, 0xff)).toEqual(["0x00000001"]);
  });

  it.each([
    ["all", [true, true], true],
    ["all", [true, false], false],
    ["all", [], true],
    ["any", [false, true], true],
    ["any", [false, false], false],
    ["any", [], false],
    ["one", [true, false], true],
    ["one", [true, true], false],
    ["one", [], false],
    ["none", [false, false], true],
    ["none", [false, true], false],
    ["none", [], true],
  ] as const)("shows a child in mode %s of parents %j: %s", (mode, parents, expected) => {
    const hashes = parents.map((_, at) => `0x0000000${at + 1}`);
    const controllers = [
      ...parents.map((state, at) => named(hashes[at] ?? "", state)),
      child("0x000000c0", mode, hashes),
    ];

    expect(mapVisibility(controllers, 1).controllers.get("0x000000c0")).toBe(expected);
  });

  it("evaluates a child of a child when the outer child is declared first", () => {
    const controllers = [
      child("0x000000c2", "none", ["0x000000c1"]),
      child("0x000000c1", "none", ["0x00000001"]),
      named("0x00000001", false),
    ];

    expect(visible(controllers, 1)).toEqual(["0x000000c1"]);
  });

  it("counts an undeclared parent as not visible", () => {
    expect(visible([child("0x000000c0", "any", ["0x0000dead"])], 1)).toEqual([]);
    expect(visible([child("0x000000c0", "none", ["0x0000dead"])], 1)).toEqual(["0x000000c0"]);
  });

  it("terminates on a parent cycle and shows neither controller", () => {
    const controllers = [
      child("0x000000c1", "any", ["0x000000c2"]),
      child("0x000000c2", "any", ["0x000000c1"]),
    ];

    expect(visible(controllers, 1)).toEqual([]);
  });

  it("shows a layer controller when a layer in its mask is active", () => {
    const controllers: MapController[] = [
      { hash: "0x00000001", name: null, rule: { kind: "layer", mask: 4 } },
    ];

    expect(visible(controllers, 0b0000_0100)).toEqual(["0x00000001"]);
    expect(visible(controllers, 0b0000_0001)).toEqual([]);
  });

  it("does not show a mutator controller or a driven controller", () => {
    const controllers: MapController[] = [
      { hash: "0x00000001", name: null, rule: { kind: "mutator", name: "MSITrophy" } },
      { hash: "0x00000002", name: null, rule: { kind: "driven" } },
    ];

    expect(visible(controllers, 0xff)).toEqual([]);
  });
});

describe("mapVisibility with overrides", () => {
  it("uses the override state and does not evaluate the rule", () => {
    const overrides = new Map([
      ["0xf4968631", false],
      ["0x68fe7644", true],
    ]);
    const states = mapVisibility(SUMMONERS_RIFT, 1, overrides).controllers;

    expect(states.get("0xf4968631")).toBe(false);
    expect(states.get("0x68fe7644")).toBe(true);
  });

  it("computes a child from the override state of its parent", () => {
    const overrides = new Map([["0x3c5b24f7", true]]);
    const states = mapVisibility(SUMMONERS_RIFT, 1, overrides).controllers;

    expect(states.get("0x5e652742")).toBe(false);
    expect(states.get("0x37c78f25")).toBe(true);
  });

  it("uses the override state of a child over its parents", () => {
    const overrides = new Map([["0x5e652742", false]]);

    expect(mapVisibility(SUMMONERS_RIFT, 1, overrides).controllers.get("0x5e652742")).toBe(false);
  });
});

describe("withControllerState", () => {
  const NONE = new Map<string, boolean>();

  it("adds an override when the state differs from the computed state", () => {
    const next = withControllerState(SUMMONERS_RIFT, 1, NONE, "0x3c5b24f7", true);

    expect([...next]).toEqual([["0x3c5b24f7", true]]);
  });

  it("adds no override when the state equals the computed state", () => {
    expect(withControllerState(SUMMONERS_RIFT, 1, NONE, "0x3c5b24f7", false).size).toBe(0);
  });

  it("removes an override when the state returns to the computed state", () => {
    const held = new Map([["0x3c5b24f7", true]]);

    expect(withControllerState(SUMMONERS_RIFT, 1, held, "0x3c5b24f7", false).size).toBe(0);
  });

  it("keeps the other overrides and does not change the map it was given", () => {
    const held = new Map([["0x3c5b24f7", true]]);
    const next = withControllerState(SUMMONERS_RIFT, 1, held, "0xf4968631", false);

    expect([...next]).toEqual([
      ["0x3c5b24f7", true],
      ["0xf4968631", false],
    ]);
    expect([...held]).toEqual([["0x3c5b24f7", true]]);
  });

  it("compares a child against the state computed from the overridden parent", () => {
    const held = new Map([["0x3c5b24f7", true]]);

    /* With Ocean forced on, the base terrain is computed as hidden. */
    expect(withControllerState(SUMMONERS_RIFT, 1, held, "0x5e652742", false)).toEqual(held);
    expect(withControllerState(SUMMONERS_RIFT, 1, held, "0x5e652742", true).get("0x5e652742")).toBe(
      true,
    );
  });
});

describe("layerVisible", () => {
  it("returns true when the mask shares a bit with the flags", () => {
    expect(layerVisible(0b0000_0101, 0b0000_0100)).toBe(true);
    expect(layerVisible(0b0000_0101, 0b0000_1000)).toBe(false);
  });

  it("returns true for mask 255 under no flags and false for mask 0 under all flags", () => {
    expect(layerVisible(0xff, 0)).toBe(true);
    expect(layerVisible(0, 0xff)).toBe(false);
  });
});

describe("meshVisible and placeableVisible", () => {
  const visibility = mapVisibility([named("0x00000001", true), named("0x00000002", false)], 1);

  it("uses the state of a declared controller and ignores the mask", () => {
    expect(meshVisible(visibility, 0b0000_1000, "0x00000001")).toBe(true);
    expect(meshVisible(visibility, 0xff, "0x00000002")).toBe(false);
    expect(placeableVisible(visibility, 0b0000_1000, "0x00000001")).toBe(true);
    expect(placeableVisible(visibility, 0xff, "0x00000002")).toBe(false);
  });

  it("uses the mask when the controller is null", () => {
    expect(meshVisible(visibility, 0b0000_0001, null)).toBe(true);
    expect(meshVisible(visibility, 0b0000_1000, null)).toBe(false);
    expect(placeableVisible(visibility, 0b0000_0001, null)).toBe(true);
    expect(placeableVisible(visibility, 0b0000_1000, null)).toBe(false);
  });

  it("uses the mask for a mesh and returns false for a placeable when the controller is undeclared", () => {
    expect(meshVisible(layerVisibility(1), 0b0000_0001, "0x0000dead")).toBe(true);
    expect(placeableVisible(layerVisibility(1), 0b0000_0001, "0x0000dead")).toBe(false);
  });
});
