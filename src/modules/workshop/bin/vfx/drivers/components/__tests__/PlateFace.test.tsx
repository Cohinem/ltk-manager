import { describe, expect, it } from "vitest";

import { nameHash } from "../../../../shared/utils/binHash";
import type { DriverNode } from "../../../engine/drivers/node";
import type { ValueCurve } from "../../../engine/model/model";
import type { DriverItem, GraphItem, ValueItem } from "../../utils/graphItems";
import { plateFace } from "../PlateFace";

const BASE = { id: "d0", wire: "", ports: [] } as const;

function driver(node: DriverNode): DriverItem {
  return { ...BASE, type: "driver", node, diagnostics: [], leaves: [] };
}

function value(classHash: string, curve: ValueCurve): ValueItem {
  return {
    ...BASE,
    type: "value",
    label: "birthScale0",
    holder: "",
    holderRows: 0,
    classHash,
    className: null,
    kind: "float",
    curve,
  };
}

function keyed(...values: number[][]): ValueCurve {
  return {
    constant: values[0] ?? [],
    keys: values.map((each, at) => ({ time: at / Math.max(values.length - 1, 1), values: each })),
    tables: [],
  };
}

describe("plateFace", () => {
  it("draws a keyed curve's lines", () => {
    expect(plateFace(value(nameHash("ValueFloat"), keyed([0], [1], [0.5]))).type).toBe("picture");
  });

  it("draws a random value's probability table", () => {
    const table = { channel: 0, single: 1, keys: keyed([1], [360]).keys };
    const face = plateFace(value(nameHash("ValueFloat"), { ...keyed([1]), tables: [table] }));

    expect(face.type).toBe("picture");
  });

  it("draws a colour's keys as a band", () => {
    const face = plateFace(value(nameHash("ValueColor"), keyed([1, 0, 0, 1], [0, 0, 1, 1])));

    expect(face.type).toBe("picture");
  });

  it("shows a constant driver's value", () => {
    const node: DriverNode = {
      type: "constant",
      kind: "vec3",
      path: "",
      classHash: nameHash("VfxVector3ConstantDriver"),
      value: [0, 100, 0.25],
    };

    expect(plateFace(driver(node))).toEqual({ type: "value", text: "(0, 100, 0.25)" });
  });

  it("draws a colour constant as a band", () => {
    const node: DriverNode = {
      type: "constant",
      kind: "vec4",
      path: "",
      classHash: nameHash("VfxColorConstantDriver"),
      value: [0.5, 0.5, 1, 1],
    };

    expect(plateFace(driver(node)).type).toBe("picture");
  });

  it("shows a flat curve leaf's constant", () => {
    const node: DriverNode = {
      type: "curve",
      kind: "float",
      path: "",
      classHash: "0x1d04cfa7",
      curve: { constant: [3], keys: [], tables: [] },
      frequency: 0,
      looping: false,
      shareRandom: false,
    };

    expect(plateFace(driver(node))).toEqual({ type: "value", text: "3" });
  });

  it("keeps the title of a component", () => {
    const component = {
      ...BASE,
      type: "component",
      name: "LifetimeComponent",
      classHash: "",
      className: null,
    } as unknown as GraphItem;

    expect(plateFace(component)).toEqual({ type: "title" });
  });
});
