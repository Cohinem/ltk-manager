import { describe, expect, it } from "vitest";

import type { VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../../shared/utils/binHash";
import {
  list,
  number,
  struct,
  valueCurve,
  vector,
} from "../../../engine/drivers/__tests__/driverFixture";
import { fieldLines, layoutGraph } from "../driverLayout";
import type { MasterItem, StructItem } from "../graphItems";
import { systemGraph } from "../systemGraph";

const hex = (name: string) => nameHash(name).slice(2);

/** A complex emitter with a flat rate, a keyed birth colour, a mesh primitive and a list. */
const SPARK = struct("VfxEmitterDefinitionData", {
  emitterName: { type: "string", value: "Spark" },
  rate: valueCurve("ValueFloat", number(12)),
  birthColor: valueCurve("ValueColor", vector(1, 1, 1, 1), [
    [0, vector(1, 0, 0, 1)],
    [1, vector(0, 0, 1, 1)],
  ]),
  primitive: struct("VfxPrimitiveMesh", {
    mMesh: struct("VfxMeshDefinitionData", { mSimpleMeshName: number(0) }),
  }),
  materialOverrideDefinitions: list(struct("VfxMaterialOverrideDefinitionData")),
});

function system(...emitters: VfxValue[]): VfxValue {
  return struct("VfxSystemDefinitionData", { complexEmitterDefinitionData: list(...emitters) });
}

function master(root: VfxValue, pending = new Map<string, string[]>()) {
  const tree = systemGraph(root, pending);
  const emitter = tree?.inputs[0]?.tree;
  if (emitter?.item.type !== "master") throw new Error("the system holds no master node");
  return { tree: emitter, item: emitter.item };
}

function fieldOf(item: MasterItem, name: string) {
  return item.groups.flatMap((each) => each.fields).find((each) => each.hash === nameHash(name));
}

describe("classicEmitters", () => {
  it("draws a complex emitter as a master node under the inspector's groups", () => {
    const { item } = master(system(SPARK));

    expect(item).toMatchObject({ id: "c0", name: "Spark", simple: false, rowCount: 5 });
    expect(item.groups.map((each) => each.group)).toEqual([
      "emission",
      "birth",
      "primitive",
      "material",
    ]);
    expect(fieldOf(item, "rate")?.input).toBeNull();
  });

  it("gives a keyed value and every struct a node on its field's input", () => {
    const { item, tree } = master(system(SPARK));

    expect(fieldOf(item, "birthColor")?.input).toMatchObject({
      type: "value",
      kind: "vec4",
      wire: `${hex("complexEmitterDefinitionData")}[0].${hex("birthColor")}`,
    });
    expect(fieldOf(item, "primitive")?.input).toMatchObject({ type: "struct", shape: "struct" });
    expect(tree.inputs.map((each) => each.tree.item.type)).toEqual(["value", "struct", "struct"]);
  });

  it("folds a struct's lone struct into it, and gives a list's items nodes of their own", () => {
    const { tree } = master(system(SPARK));
    const primitive = tree.inputs[1]?.tree.item as StructItem;
    const overrides = tree.inputs[2]?.tree.item as StructItem;

    expect(primitive.rows).toEqual([]);
    expect(primitive.nested).toMatchObject({ type: "struct", label: "mMesh" });
    expect(primitive.field).toBe(nameHash("primitive"));
    expect(overrides).toMatchObject({
      shape: "list",
      field: nameHash("materialOverrideDefinitions"),
    });
    expect(overrides.rows[0]?.input).toMatchObject({ wire: `${overrides.wire}[0]`, field: null });
  });

  it("lists a picked field under its group until the file writes it", () => {
    const { item } = master(system(SPARK), new Map([["c0", [nameHash("drag")]]]));

    expect(item.groups.find((each) => each.group === "motion")?.fields).toEqual([
      { hash: nameHash("drag"), input: null, pending: true },
    ]);
  });

  it("sizes a master node by its groups' lines", () => {
    const { item } = master(system(SPARK));
    const placed = layoutGraph(systemGraph(system(SPARK))!).items.find(
      (each) => each.item.id === "c0",
    );

    expect(fieldLines(item)).toBe(4 * 2 + 4 + 1);
    expect(placed?.height).toBeGreaterThan(fieldLines(item) * 26);
  });
});
