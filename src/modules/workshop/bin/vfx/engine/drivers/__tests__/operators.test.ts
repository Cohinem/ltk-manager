import { describe, expect, it } from "vitest";

import type { VfxValue } from "@/lib/tauri";

import { compileDriver } from "../compileDriver";
import type { DriverContext } from "../context";
import type { DriverKind } from "../node";
import { readDriver } from "../readDriver";
import { list, number, struct, valueCurve, vector } from "./driverFixture";

/** A leaf of `kind` holding `values`: a constant, or a curve leaf keyed flat at `values`. */
type Leaf = (kind: DriverKind, ...values: number[]) => VfxValue;

const CONSTANT: Leaf = (kind, ...values) => {
  const [name, slot] = CONSTANT_CLASS[kind];
  return struct(name, { [slot]: held(values) });
};

const KEYED: Leaf = (kind, ...values) => {
  const [hash, slot, valueClass] = CURVE_CLASS[kind];
  const value = held(values);
  return struct(hash, {
    [slot]: valueCurve(valueClass, value, [
      [0, value],
      [1, value],
    ]),
  });
};

const CONSTANT_CLASS: Record<DriverKind, [string, string]> = {
  float: ["VfxFloatConstantDriver", "Float"],
  vec2: ["VfxVector2ConstantDriver", "Vector2"],
  vec3: ["VfxVector3ConstantDriver", "Vector3"],
  vec4: ["VfxColorConstantDriver", "Color"],
};

const CURVE_CLASS: Record<DriverKind, [string, string, string]> = {
  float: ["0x1d04cfa7", "Float", "ValueFloat"],
  vec2: ["0x3eb74cbe", "Vector2", "ValueVector2"],
  vec3: ["0x2d42ea41", "Vector3", "ValueVector3"],
  vec4: ["0x7cc5a312", "colors", "ValueColor"],
};

function held(values: number[]): VfxValue {
  return values.length === 1 ? number(values[0]) : vector(...values);
}

interface Case {
  readonly name: string;
  readonly kind: DriverKind;
  readonly graph: (leaf: Leaf) => VfxValue;
  readonly expected: readonly number[];
}

const CASES: readonly Case[] = [
  {
    name: "add sums every entry",
    kind: "float",
    graph: (leaf) =>
      struct("VfxAddFloatDriver", {
        params: list(leaf("float", 1), leaf("float", 2), leaf("float", 3)),
      }),
    expected: [6],
  },
  {
    name: "add sums component-wise",
    kind: "vec3",
    graph: (leaf) =>
      struct("VfxAddVector3Driver", { params: list(leaf("vec3", 1, 2, 3), leaf("vec3", 4, 5, 6)) }),
    expected: [5, 7, 9],
  },
  {
    name: "multiply multiplies component-wise",
    kind: "vec2",
    graph: (leaf) =>
      struct("VfxMultiplyVector2Driver", { params: list(leaf("vec2", 2, 3), leaf("vec2", 4, 5)) }),
    expected: [8, 15],
  },
  {
    name: "min takes the least of each component",
    kind: "vec4",
    graph: (leaf) =>
      struct("VfxMinVector4Driver", {
        params: list(leaf("vec4", 1, 5, 3, 0), leaf("vec4", 2, 4, 6, -1)),
      }),
    expected: [1, 4, 3, -1],
  },
  {
    name: "max takes the greatest entry",
    kind: "float",
    graph: (leaf) =>
      struct("VfxMaxFloatDriver", {
        params: list(leaf("float", 1), leaf("float", -2), leaf("float", 7)),
      }),
    expected: [7],
  },
  {
    name: "an empty params list reads as zero",
    kind: "vec2",
    graph: () => struct("VfxMultiplyVector2Driver", { params: list() }),
    expected: [0, 0],
  },
  {
    name: "abs takes each component's magnitude",
    kind: "vec3",
    graph: (leaf) => struct("VfxAbsVector3Driver", { Param: leaf("vec3", -1, 2, -3) }),
    expected: [1, 2, 3],
  },
  {
    name: "normalize scales to unit length",
    kind: "vec2",
    graph: (leaf) => struct("VfxNormalizeVector2Driver", { Vector2Input: leaf("vec2", 3, 4) }),
    expected: [0.6, 0.8],
  },
  {
    name: "normalize reads a zero vector as zero",
    kind: "vec3",
    graph: (leaf) => struct("VfxNormalizeVector3Driver", { Vector3Input: leaf("vec3", 0, 0, 0) }),
    expected: [0, 0, 0],
  },
  {
    name: "length measures a vector",
    kind: "float",
    graph: (leaf) => struct("VfxLengthVector3Driver", { Vector3Input: leaf("vec3", 2, 3, 6) }),
    expected: [7],
  },
  {
    name: "clamp holds a float inside its bounds",
    kind: "float",
    graph: (leaf) =>
      struct("VfxClampFloatDriver", { Param: leaf("float", 5), Low: number(0), High: number(2) }),
    expected: [2],
  },
  {
    name: "clamp takes its default bounds, 0 to 1",
    kind: "vec2",
    graph: (leaf) => struct("VfxClampVector2Driver", { Param: leaf("vec2", -1, 0.5) }),
    expected: [0, 0.5],
  },
  {
    name: "clamp with crossed bounds reads as zero",
    kind: "float",
    graph: (leaf) =>
      struct("VfxClampFloatDriver", { Param: leaf("float", 5), Low: number(3), High: number(1) }),
    expected: [0],
  },
  {
    name: "lerp blends from From to To by Factor",
    kind: "vec3",
    graph: (leaf) =>
      struct("VfxVector3LerpDriver", {
        From: leaf("vec3", 0, 0, 0),
        To: leaf("vec3", 10, 20, 30),
        Factor: leaf("float", 0.25),
      }),
    expected: [2.5, 5, 7.5],
  },
  {
    name: "lerp leaves Factor unclamped",
    kind: "float",
    graph: (leaf) =>
      struct("VfxFloatLerpDriver", {
        From: leaf("float", 1),
        To: leaf("float", 3),
        Factor: leaf("float", 2),
      }),
    expected: [5],
  },
  {
    name: "scale multiplies a vector by a float",
    kind: "vec2",
    graph: (leaf) =>
      struct("VfxScaleVector2Driver", {
        Vector2: leaf("vec2", 1, 2),
        ScaleFactor: leaf("float", 3),
      }),
    expected: [3, 6],
  },
  {
    name: "divide divides a float",
    kind: "float",
    graph: (leaf) => struct("0xd6738324", { value: leaf("float", 6), Divisor: leaf("float", 3) }),
    expected: [2],
  },
  {
    name: "divide divides a vector by a float",
    kind: "vec3",
    graph: (leaf) =>
      struct("0x95182f0a", { Vector3: leaf("vec3", 2, 4, 6), Divisor: leaf("float", 2) }),
    expected: [1, 2, 3],
  },
  {
    name: "divide divides component-wise, and a zero divisor gives zero",
    kind: "vec2",
    graph: (leaf) =>
      struct("0x997d54ab", { Vector2: leaf("vec2", 6, 8), Divisor: leaf("vec2", 2, 0) }),
    expected: [3, 0],
  },
  {
    name: "compose builds a vector from four floats",
    kind: "vec4",
    graph: (leaf) =>
      struct("0x3624c20b", {
        X: leaf("float", 1),
        Y: leaf("float", 2),
        Z: leaf("float", 3),
        W: leaf("float", 4),
      }),
    expected: [1, 2, 3, 4],
  },
  {
    name: "compose builds a vector from two halves",
    kind: "vec4",
    graph: (leaf) => struct("0x791d4f88", { xy: leaf("vec2", 1, 2), Zw: leaf("vec2", 3, 4) }),
    expected: [1, 2, 3, 4],
  },
  {
    name: "compose builds a colour from RGB and alpha",
    kind: "vec4",
    graph: (leaf) =>
      struct("VfxColorRgbaDriver", { Rgb: leaf("vec3", 0.25, 0.5, 1), Alpha: leaf("float", 0.5) }),
    expected: [0.25, 0.5, 1, 0.5],
  },
  {
    name: "broadcast writes a float to every component",
    kind: "vec3",
    graph: (leaf) => struct("0xdef9bfd5", { Float: leaf("float", 2) }),
    expected: [2, 2, 2],
  },
  {
    name: "extend appends its stored float",
    kind: "vec3",
    graph: (leaf) => struct("0xe3a77546", { Input: leaf("vec2", 1, 2), "0xb1ea6248": number(3) }),
    expected: [1, 2, 3],
  },
  {
    name: "extend appends its stored pair",
    kind: "vec4",
    graph: (leaf) =>
      struct("0x14daebe5", { Input: leaf("vec2", 1, 2), "0xb1ea6248": vector(3, 4) }),
    expected: [1, 2, 3, 4],
  },
  {
    name: "extend appends its default where the file writes none",
    kind: "vec4",
    graph: (leaf) => struct("0x9c5c4342", { Input: leaf("vec3", 1, 2, 3) }),
    expected: [1, 2, 3, 0],
  },
];

const AT: DriverContext = { now: 0, emitterAge: 0, emitterPhase: 0.5, particle: null };

function evaluate(graph: VfxValue, kind: DriverKind) {
  const compiled = compileDriver(readDriver(graph, kind, "field").node, { scope: "emitter" });
  const out = new Float32Array(compiled.width);
  compiled.evaluate(AT, out, 0);
  return { compiled, out: Array.from(out) };
}

function expectClose(actual: readonly number[], expected: readonly number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, at) => expect(value).toBeCloseTo(expected[at], 5));
}

describe("operators", () => {
  it.each(CASES)("$name", ({ kind, graph, expected }) => {
    const { compiled, out } = evaluate(graph(CONSTANT), kind);

    expect(compiled.variability).toBe("constant");
    expectClose(Array.from(compiled.constant ?? []), expected);
    expectClose(out, expected);
  });

  it.each(CASES)("$name, unfolded, evaluates as it folds", ({ kind, graph, expected }) => {
    const folded = evaluate(graph(CONSTANT), kind);
    const unfolded = evaluate(graph(KEYED), kind);

    const hasLeaves = JSON.stringify(graph(KEYED)) !== JSON.stringify(graph(CONSTANT));

    expect(unfolded.compiled.variability).toBe(hasLeaves ? "emitter" : "constant");
    expect(unfolded.out).toEqual(folded.out);
    expectClose(unfolded.out, expected);
  });

  it("takes the highest variability of its inputs", () => {
    const graph = struct("VfxAddFloatDriver", {
      params: list(CONSTANT("float", 1), KEYED("float", 2)),
    });
    const compiled = compileDriver(readDriver(graph, "float", "field").node, {
      scope: "particle",
    });

    expect(compiled.variability).toBe("particle");
    expect(compiled.constant).toBeNull();
  });

  it("writes at the offset given and leaves the rest of the buffer", () => {
    const graph = struct("0x9a2d73f2", { Float: KEYED("float", 4) });
    const compiled = compileDriver(readDriver(graph, "vec2", "field").node, { scope: "emitter" });
    const out = new Float32Array([9, 9, 9, 9]);

    compiled.evaluate(AT, out, 1);
    expect(Array.from(out)).toEqual([9, 4, 4, 9]);
  });
});
