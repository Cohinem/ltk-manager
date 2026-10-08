import { describe, expect, it } from "vitest";

import type { MapController, MapControllerRule } from "@/lib/tauri";

import {
  type ControllerDependent,
  controllerLabel,
  controllerSections,
  layerNumbers,
  materialName,
  ruleTitle,
} from "../mapControllers";

const controller = (hash: string, rule: MapControllerRule): MapController => ({
  hash,
  name: null,
  rule,
});

const terrain = (hash: string, layers: number) =>
  controller(hash, { kind: "named", defaultVisible: false, terrain: layers, stage: 0 });

const stage = (hash: string, bits: number) =>
  controller(hash, { kind: "named", defaultVisible: false, terrain: 0, stage: bits });

const plain = (hash: string) =>
  controller(hash, { kind: "named", defaultVisible: true, terrain: 0, stage: 0 });

/** A dependent as `hash relation`, with its own dependents nested after it. */
function outline(dependents: readonly ControllerDependent[]): unknown[] {
  return dependents.map((each) =>
    each.dependents.length === 0
      ? `${each.relation} ${each.controller.hash}`
      : [`${each.relation} ${each.controller.hash}`, outline(each.dependents)],
  );
}

describe("layerNumbers", () => {
  it("returns the 1-based number of each bit in the mask, in bit order", () => {
    expect(layerNumbers(0b0000_1000)).toEqual([4]);
    expect(layerNumbers(0b0100_0101)).toEqual([1, 3, 7]);
    expect(layerNumbers(0)).toEqual([]);
  });
});

describe("ruleTitle", () => {
  it("returns the layers of a terrain controller and of a layer controller", () => {
    expect(ruleTitle({ kind: "named", defaultVisible: false, terrain: 8, stage: 0 })).toBe(
      "Layer 4",
    );
    expect(ruleTitle({ kind: "layer", mask: 0b0000_0110 })).toBe("Layer 2, 3");
  });

  it("returns the stage of a stage controller", () => {
    expect(ruleTitle({ kind: "named", defaultVisible: false, terrain: 0, stage: 4 })).toBe(
      "Stage 3",
    );
  });

  it("returns the name of a mutator", () => {
    expect(ruleTitle({ kind: "mutator", name: "SR_Hall_Of_Legends" })).toBe("SR_Hall_Of_Legends");
  });

  it("returns null for a plain named controller, a child and a driven controller", () => {
    expect(ruleTitle({ kind: "named", defaultVisible: true, terrain: 0, stage: 0 })).toBeNull();
    expect(ruleTitle({ kind: "child", parents: ["0x00000001"], mode: "none" })).toBeNull();
    expect(ruleTitle({ kind: "driven" })).toBeNull();
  });
});

describe("controllerLabel", () => {
  it("returns the name of a controller, and its hash if it has no name", () => {
    const rule = { kind: "driven" } as const;

    expect(controllerLabel({ hash: "0x00000001", name: "Baron_Tunnel", rule })).toBe(
      "Baron_Tunnel",
    );
    expect(controllerLabel({ hash: "0x00000001", name: null, rule })).toBe("0x00000001");
  });
});

describe("controllerSections", () => {
  it("groups the independent controllers by kind, terrains by layer and stages by stage", () => {
    const sections = controllerSections([
      controller("0x00000001", { kind: "driven" }),
      controller("0x00000002", { kind: "mutator", name: "MSITrophy" }),
      plain("0x00000003"),
      stage("0x00000004", 4),
      stage("0x00000005", 1),
      terrain("0x00000006", 64),
      terrain("0x00000007", 2),
      controller("0x00000008", { kind: "layer", mask: 4 }),
    ]);

    expect(
      sections.map((section) => [
        section.group,
        section.entries.map((entry) => entry.controller.hash),
      ]),
    ).toEqual([
      ["terrain", ["0x00000007", "0x00000006"]],
      ["stage", ["0x00000005", "0x00000004"]],
      ["mutator", ["0x00000002"]],
      ["other", ["0x00000001", "0x00000003", "0x00000008"]],
    ]);
  });

  it("has no section for a group with no controllers", () => {
    expect(controllerSections([plain("0x00000001")]).map((section) => section.group)).toEqual([
      "other",
    ]);
    expect(controllerSections([])).toEqual([]);
  });

  it("lists a child under each of its parents, as shown with it or hidden by it", () => {
    const sections = controllerSections([
      controller("0x000000c1", {
        kind: "child",
        parents: ["0x000000a1", "0x000000a2"],
        mode: "none",
      }),
      controller("0x000000c2", {
        kind: "child",
        parents: ["0x000000a2", "0x000000b1"],
        mode: "all",
      }),
      controller("0x000000c3", { kind: "child", parents: ["0x000000a1"], mode: "any" }),
      controller("0x000000c4", { kind: "child", parents: ["0x000000a1"], mode: "one" }),
      terrain("0x000000a1", 2),
      terrain("0x000000a2", 4),
      plain("0x000000b1"),
    ]);
    const dependents = Object.fromEntries(
      sections.flatMap((section) =>
        section.entries.map((entry) => [entry.controller.hash, outline(entry.dependents)]),
      ),
    );

    expect(dependents).toEqual({
      "0x000000a1": ["unless 0x000000c1", "with 0x000000c3", "with 0x000000c4"],
      "0x000000a2": ["unless 0x000000c1", "with 0x000000c2"],
      "0x000000b1": ["with 0x000000c2"],
    });
  });

  it("lists a child of a child under that child", () => {
    const [section] = controllerSections([
      plain("0x000000b1"),
      controller("0x000000c1", { kind: "child", parents: ["0x000000b1"], mode: "none" }),
      controller("0x000000c2", { kind: "child", parents: ["0x000000c1"], mode: "any" }),
    ]);

    expect(section?.entries.map((entry) => entry.controller.hash)).toEqual(["0x000000b1"]);
    expect(outline(section?.entries[0]?.dependents ?? [])).toEqual([
      ["unless 0x000000c1", ["with 0x000000c2"]],
    ]);
  });

  it("lists a child with no declared parent as an entry of the last group", () => {
    const sections = controllerSections([
      controller("0x000000c1", { kind: "child", parents: ["0x0000dead"], mode: "any" }),
      controller("0x000000c2", { kind: "child", parents: [], mode: "all" }),
    ]);

    expect(sections).toHaveLength(1);
    expect(sections[0]?.group).toBe("other");
    expect(sections[0]?.entries.map((entry) => entry.controller.hash)).toEqual([
      "0x000000c1",
      "0x000000c2",
    ]);
  });

  it("does not list a child that names itself as a parent under itself", () => {
    const [section] = controllerSections([
      plain("0x000000b1"),
      controller("0x000000c1", {
        kind: "child",
        parents: ["0x000000b1", "0x000000c1"],
        mode: "any",
      }),
    ]);

    expect(outline(section?.entries[0]?.dependents ?? [])).toEqual(["with 0x000000c1"]);
  });
});

describe("materialName", () => {
  it("returns the last segment of a material path", () => {
    expect(materialName("Maps/KitPieces/SRX/Materials/Chaos_Baron_A_MAT")).toBe(
      "Chaos_Baron_A_MAT",
    );
    expect(materialName("Chaos_Baron_A_MAT")).toBe("Chaos_Baron_A_MAT");
  });
});
