import { describe, expect, it } from "vitest";

import { nameHash } from "../../../../shared/utils/binHash";
import { readDriver } from "../readDriver";
import { driverClasses } from "../registry";
import { bool, list, number, struct, valueCurve, vector } from "./driverFixture";

describe("the registry", () => {
  it("keys each named class on the hash of its name", () => {
    for (const [hash, entry] of driverClasses()) {
      if (entry.name.startsWith("0x")) {
        expect(hash).toBe(entry.name);
        continue;
      }
      expect(hash, entry.name).toBe(nameHash(entry.name));
    }
  });

  it("marks the wrappers and constants attested and every other class inferred", () => {
    const levels = [...driverClasses().values()].map((entry) => [entry.name, entry.level]);
    const attested = levels.filter(([, level]) => level === "attested").map(([name]) => name);
    expect(attested).toEqual([
      "VfxFloatDynamicProperty",
      "VfxVector2DynamicProperty",
      "VfxVector3DynamicProperty",
      "VfxVector4DynamicProperty",
      "VfxFloatConstantDriver",
      "VfxVector2ConstantDriver",
      "VfxVector3ConstantDriver",
      "VfxColorConstantDriver",
      "VfxColorRgbConstantDriver",
    ]);
    expect(levels.every(([, level]) => level !== "unsupported")).toBe(true);
  });

  it("gives each class a port per input field, and a list port only to n-ary classes", () => {
    for (const entry of driverClasses().values()) {
      const lists = entry.inputs.filter((each) => each.list).map((each) => each.field);
      const nary = /^Vfx(Add|Multiply|Min|Max)/.test(entry.name);
      expect(lists, entry.name).toEqual(nary ? ["params"] : []);
    }
  });
});

describe("readDriver on operators", () => {
  const one = struct("VfxFloatConstantDriver", { Float: number(1) });

  it("reads each params entry at a path that keeps its index", () => {
    const { node, diagnostics } = readDriver(
      struct("VfxAddFloatDriver", { params: list(one, one) }),
      "float",
      "Rate",
    );

    expect(diagnostics.map((each) => each.code)).toEqual(["inferred"]);
    expect(node).toMatchObject({
      type: "operator",
      operator: "add",
      inputs: [
        { field: "params[0]", node: { type: "constant", path: "Rate/params[0]" } },
        { field: "params[1]", node: { type: "constant", path: "Rate/params[1]" } },
      ],
    });
  });

  it("reports an empty params list", () => {
    const { diagnostics } = readDriver(struct("VfxMaxVector2Driver"), "vec2", "Size");
    expect(diagnostics).toContainEqual({
      code: "emptyParams",
      level: "inferred",
      classHash: nameHash("VfxMaxVector2Driver"),
      path: "Size",
    });
  });

  it("reads a clamp's bounds with their defaults, and reports bounds that cross", () => {
    const clamp = readDriver(
      struct("VfxClampVector2Driver", { Param: struct("VfxVector2ConstantDriver") }),
      "vec2",
      "Size",
    );
    expect(clamp.node).toMatchObject({
      stored: [
        { field: "Low", value: [0, 0] },
        { field: "High", value: [1, 1] },
      ],
    });

    const crossed = readDriver(
      struct("VfxClampFloatDriver", { Param: one, Low: number(2), High: number(1) }),
      "float",
      "Rate",
    );
    expect(crossed.diagnostics.map((each) => each.code)).toContain("inverseBounds");
  });

  it("reads an extension's unnamed appended part", () => {
    const { node } = readDriver(
      struct("0x14daebe5", {
        Input: struct("VfxVector2ConstantDriver", { Vector2: vector(1, 2) }),
        "0xb1ea6248": vector(3, 4),
      }),
      "vec4",
      "Tint",
    );
    expect(node).toMatchObject({ stored: [{ field: "0xb1ea6248", value: [3, 4] }] });
  });

  it("reads an input of another kind as unknown and reports it where it sits", () => {
    const { node, diagnostics } = readDriver(
      struct("VfxScaleVector3Driver", {
        Vector3: struct("VfxVector3ConstantDriver"),
        ScaleFactor: struct("VfxVector3ConstantDriver"),
      }),
      "vec3",
      "Scale",
    );

    expect(node).toMatchObject({ inputs: [{}, { node: { type: "unknown", kind: "float" } }] });
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: "kindMismatch", path: "Scale/ScaleFactor" }),
    );
  });
});

describe("readDriver", () => {
  it("reads a wrapper and the constant it holds", () => {
    const graph = struct("VfxVector3DynamicProperty", {
      Vector3: struct("VfxVector3ConstantDriver", { Vector3: vector(1, 2, 3) }),
    });

    const { node, diagnostics } = readDriver(graph, "vec3", "Scale");

    expect(diagnostics).toEqual([]);
    expect(node).toMatchObject({
      type: "property",
      kind: "vec3",
      path: "Scale",
      driver: { type: "constant", kind: "vec3", path: "Scale/Vector3", value: [1, 2, 3] },
    });
  });

  it("gives a constant that writes no value its schema default", () => {
    const { node } = readDriver(struct("VfxColorConstantDriver"), "vec4", "Tint");
    expect(node).toMatchObject({ type: "constant", value: [0, 0, 0, 1] });
  });

  it("reads a curve leaf and reports it inferred", () => {
    const leaf = struct("0x1d04cfa7", {
      Float: valueCurve("ValueFloat", number(2), [
        [0, number(0)],
        [1, number(4)],
      ]),
    });

    const { node, diagnostics } = readDriver(leaf, "float", "Rate");

    expect(node).toMatchObject({
      type: "curve",
      frequency: 0,
      looping: false,
      shareRandom: false,
      curve: {
        constant: [2],
        keys: [
          { time: 0, values: [0] },
          { time: 1, values: [4] },
        ],
      },
    });
    expect(diagnostics).toEqual([
      { code: "inferred", level: "inferred", classHash: "0x1d04cfa7", path: "Rate" },
    ]);
  });

  it("reports what a curve leaf sets that the sampler has no reading for", () => {
    const leaf = struct("0x2d42ea41", {
      Vector3: valueCurve("ValueVector3", vector(1, 1, 1)),
      frequency: number(2),
      looping: bool(true),
      ShareRandom: bool(true),
    });

    const { node, diagnostics } = readDriver(leaf, "vec3", "Velocity");

    expect(node).toMatchObject({ type: "curve", frequency: 2, looping: true, shareRandom: true });
    expect(diagnostics.map((it) => [it.code, it.level])).toEqual([
      ["inferred", "inferred"],
      ["unreadFrequency", "unsupported"],
      ["unreadLooping", "unsupported"],
    ]);
  });

  it("reads a class it does not know as unknown and reports it", () => {
    const graph = struct("VfxFloatDynamicProperty", {
      Float: struct("VfxFloatTimeDriver", { Time: number(7) }),
    });

    const { node, diagnostics } = readDriver(graph, "float", "Rate");

    expect(node).toMatchObject({
      type: "property",
      driver: { type: "unknown", kind: "float", classHash: nameHash("VfxFloatTimeDriver") },
    });
    expect(diagnostics).toEqual([
      {
        code: "unknownClass",
        level: "unsupported",
        classHash: nameHash("VfxFloatTimeDriver"),
        path: "Rate/Float",
      },
    ]);
  });

  it("reads a class of another kind than its slot as unknown", () => {
    const graph = struct("VfxFloatDynamicProperty", {
      Float: struct("VfxVector3ConstantDriver", { Vector3: vector(1, 2, 3) }),
    });

    const { node, diagnostics } = readDriver(graph, "float", "Rate");

    expect(node).toMatchObject({ driver: { type: "unknown", kind: "float" } });
    expect(diagnostics.map((it) => it.code)).toEqual(["kindMismatch"]);
  });

  it("reads an empty pointer and a slot holding no struct", () => {
    const empty = readDriver(struct("VfxFloatDynamicProperty"), "float", "Rate");
    expect(empty.node).toMatchObject({ driver: { type: "empty", path: "Rate/Float" } });
    expect(empty.diagnostics.map((it) => [it.code, it.level])).toEqual([
      ["emptyDriver", "inferred"],
    ]);

    const leaf = readDriver(number(3), "float", "Rate");
    expect(leaf.node).toMatchObject({ type: "unknown", classHash: null });
    expect(leaf.diagnostics.map((it) => it.code)).toEqual(["notADriver"]);
  });
});
