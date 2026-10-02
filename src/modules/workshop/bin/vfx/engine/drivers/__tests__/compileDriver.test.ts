import { describe, expect, it } from "vitest";

import type { VfxValue } from "@/lib/tauri";

import { compileDriver } from "../compileDriver";
import type { DriverContext } from "../context";
import type { DriverKind, DriverScope } from "../node";
import { readDriver } from "../readDriver";
import { number, struct, valueCurve, vector } from "./driverFixture";

function compile(graph: VfxValue, kind: DriverKind, scope: DriverScope = "particle") {
  return compileDriver(readDriver(graph, kind, "field").node, { scope });
}

function context(emitterPhase: number, age01: number | null): DriverContext {
  return {
    now: 0,
    emitterAge: 0,
    emitterPhase,
    emitterRandoms: new Float32Array(0),
    particle: age01 === null ? null : { row: 0, age: 0, age01, randoms: new Float32Array(0) },
  };
}

function evaluate(
  compiled: ReturnType<typeof compileDriver>,
  at: DriverContext,
  width = compiled.width,
) {
  const out = new Float32Array(width);
  compiled.evaluate(at, out, 0);
  return Array.from(out);
}

/**
 * A `VfxFloatDynamicProperty` over a curve leaf keyed 0 at the start and 10 at the end, at
 * `frequency`.
 */
function ramp(frequency: number) {
  return struct("VfxFloatDynamicProperty", {
    Float: struct("0x1d04cfa7", {
      Float: valueCurve("ValueFloat", number(5), [
        [0, number(0)],
        [1, number(10)],
      ]),
      frequency: number(frequency),
    }),
  });
}

describe("compileDriver", () => {
  it("folds a constant graph and writes it at the offset given", () => {
    const compiled = compile(
      struct("VfxVector3DynamicProperty", {
        Vector3: struct("VfxVector3ConstantDriver", { Vector3: vector(1, 2, 3) }),
      }),
      "vec3",
    );

    expect(compiled.variability).toBe("constant");
    expect(Array.from(compiled.constant ?? [])).toEqual([1, 2, 3]);

    const out = new Float32Array([9, 9, 9, 9, 9]);
    compiled.evaluate(context(0, null), out, 1);
    expect(Array.from(out)).toEqual([9, 1, 2, 3, 9]);
  });

  it("folds a curve leaf with no keys to its constant", () => {
    const compiled = compile(
      struct("0x7cc5a312", { colors: valueCurve("ValueColor", vector(0.5, 0.25, 1, 1)) }),
      "vec4",
    );

    expect(compiled.variability).toBe("constant");
    expect(Array.from(compiled.constant ?? [])).toEqual([0.5, 0.25, 1, 1]);
  });

  it("samples a keyed leaf of kPerParticle frequency at the particle's age", () => {
    const compiled = compile(ramp(1), "float", "particle");

    expect(compiled.variability).toBe("particle");
    expect(compiled.constant).toBeNull();
    expect(evaluate(compiled, context(0.9, 0.25))).toEqual([2.5]);
    expect(evaluate(compiled, context(0.9, null))).toEqual([0]);
  });

  it("samples a keyed leaf of kPerEmitter frequency at the emitter's phase in any scope", () => {
    for (const scope of ["emitter", "particle"] as const) {
      const compiled = compile(ramp(0), "float", scope);

      expect(compiled.variability).toBe("emitter");
      expect(evaluate(compiled, context(0.75, 0.1))).toEqual([7.5]);
    }
  });

  it("writes exactly its kind's width for a curve of fewer channels", () => {
    const compiled = compile(
      struct("0x7cc5a312", {
        colors: valueCurve("ValueColor", vector(0, 0, 0), [
          [0, vector(1, 1, 1)],
          [1, vector(3, 3, 3)],
        ]),
      }),
      "vec4",
    );

    const out = new Float32Array([9, 9, 9, 9, 9, 9]);
    compiled.evaluate(context(0.5, 0.5), out, 1);
    expect(Array.from(out)).toEqual([9, 2, 2, 2, 0, 9]);
  });

  it("evaluates an unread node to its kind's zero", () => {
    const unknown = compile(
      struct("VfxVector2DynamicProperty", { Vector2: struct("VfxAbsVector2Driver") }),
      "vec2",
    );
    const empty = compile(struct("VfxVector4DynamicProperty"), "vec4");

    expect(Array.from(unknown.constant ?? [])).toEqual([0, 0]);
    expect(Array.from(empty.constant ?? [])).toEqual([0, 0, 0, 0]);
  });
});
