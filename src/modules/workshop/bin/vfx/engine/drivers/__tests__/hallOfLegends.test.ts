import { describe, expect, it } from "vitest";

import type { VfxValue } from "@/lib/tauri";

import { constant, curve, field } from "../../parsing/readValue";
import { sampleCurve } from "../../utils/sampleCurve";
import { compileDriver } from "../compileDriver";
import type { DriverContext } from "../context";
import type { DriverScope } from "../node";
import { readDriver } from "../readDriver";
import { driverClass } from "../registry";
import fixture from "./hallOfLegends.fixture.json";

/** One distinct graph of the 80 Hall of Legends shimmer emitters, as `survey_drivers` writes it. */
interface Fixture {
  readonly path: string;
  readonly count: number;
  readonly graph: VfxValue;
}

const GRAPHS = (fixture as unknown as { graphs: Fixture[] }).graphs;

const SCOPES: readonly DriverScope[] = ["emitter", "particle"];

function contextAt(time01: number): DriverContext {
  return {
    now: time01,
    emitterAge: time01,
    emitterPhase: time01,
    particle: { row: 0, age01: time01 },
  };
}

function read({ graph, path }: Fixture) {
  if (graph.type !== "struct") throw new Error(`${path} holds no struct`);
  const kind = driverClass(graph.classHash)?.kind;
  if (kind === undefined) throw new Error(`${path} is no class the registry reads`);
  return readDriver(graph, kind, path);
}

describe("the Hall of Legends driver graphs", () => {
  it("covers every graph of the 80 emitters", () => {
    expect(GRAPHS).toHaveLength(10);
    expect(GRAPHS.reduce((sum, graph) => sum + graph.count, 0)).toBe(420);
  });

  it("reads every node with no unsupported diagnostic", () => {
    for (const graph of GRAPHS) {
      const unsupported = read(graph).diagnostics.filter((it) => it.level === "unsupported");
      expect(unsupported, graph.path).toEqual([]);
    }
  });

  it("reports each curve leaf as inferred and nothing else", () => {
    const codes = GRAPHS.flatMap((graph) => read(graph).diagnostics.map((it) => it.code));
    expect(new Set(codes)).toEqual(new Set(["inferred"]));
    expect(codes).toHaveLength(3);
  });

  it("folds every graph to a constant at compile time", () => {
    const folded = GRAPHS.map((graph) => {
      const compiled = compileDriver(read(graph).node, { scope: "particle" });
      return [compiled.variability, Array.from(compiled.constant ?? [])];
    });

    expect(folded).toEqual([
      ["constant", [0]],
      ["constant", [1]],
      ["constant", [-1]],
      ["constant", [1, 1, 1]],
      ["constant", [180, 0, 0]],
      ["constant", [3]],
      ["constant", [0, 100, 0]],
      ["constant", [10, 10, 10]],
      ["constant", [2]],
      ["constant", [Math.fround(0.55414665), Math.fround(0.539559), 1, 1]],
    ]);
  });

  it("evaluates each ValueFloat leaf to what sampleCurve gives for its curve", () => {
    const leaves = GRAPHS.filter(({ graph }) => JSON.stringify(graph).includes('"ValueFloat"'));
    expect(leaves.map((it) => it.count)).toEqual([20]);

    for (const leaf of leaves) {
      const held = curve(field(field(leaf.graph, FLOAT), FLOAT), constant([0]));
      const node = read(leaf).node;

      for (const scope of SCOPES) {
        const compiled = compileDriver(node, { scope });
        for (const time01 of [0, 0.5, 1]) {
          const out = new Float32Array(1);
          compiled.evaluate(contextAt(time01), out, 0);
          expect(out[0]).toBe(sampleCurve(held, time01)[0]);
        }
      }
    }
  });
});

/** `Float`, the field a `VfxFloatDynamicProperty` holds its driver in and a curve leaf its curve. */
const FLOAT = "0xa6c45d85";
