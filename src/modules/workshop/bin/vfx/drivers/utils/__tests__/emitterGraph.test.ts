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
import {
  FIELD_PADDING,
  fieldLines,
  HEADER_HEIGHT,
  isPrimitive,
  layoutGraph,
  LINE_HEIGHT,
  PRIMITIVE_PREVIEW,
} from "../driverLayout";
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

  it("draws a material's lists as lines of its node wherever the emitter holds it", () => {
    const param = struct("StaticMaterialShaderParamDef", {
      name: { type: "string", value: "Color" },
    });
    const material = struct("VfxMaterialContainer", {
      Material: struct("StaticMaterialDef", { paramValues: list(param, param, param) }),
    });
    const emitter = struct("VfxEmitterDefinitionData", {
      VfxComponents: struct("VfxComponents", {
        RenderComponent: struct("VfxMaterialRenderComponent", { MaterialContainer: material }),
      }),
    });
    const { tree } = master(system(emitter));
    const count = (node: typeof tree): number =>
      1 + node.inputs.reduce((sum, input) => sum + count(input.tree), 0);

    expect(count(tree)).toBe(2);
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

  it("moves a spawn shape taller than its one input clear of the node above it", () => {
    const keyed = valueCurve("ValueVector3", vector(0, 0, 0), [
      [0, vector(0, 0, 0)],
      [1, vector(1, 1, 1)],
    ]);
    const shape = struct("VfxShapeLegacy", { emitOffset: keyed });
    if (shape.type === "struct") shape.class = "VfxShapeLegacy";
    const emitter = struct("VfxEmitterDefinitionData", {
      emitterName: { type: "string", value: "Shaped" },
      birthScale0: keyed,
      shape,
    });
    const { items } = layoutGraph(systemGraph(system(emitter))!);
    const placed = items.find((each) => each.item.type === "struct");

    expect(placed?.height).toBeGreaterThan(200);
    for (const one of items) {
      for (const other of items) {
        if (one === other || one.x !== other.x) continue;
        const apart = one.y + one.height <= other.y || other.y + other.height <= one.y;
        expect(apart, `${one.item.id} and ${other.item.id}`).toBe(true);
      }
    }
  });

  it("leaves a primitive node room for its sketch over its rows", () => {
    const { tree } = master(system(SPARK));
    const primitive = tree.inputs[1]?.tree.item as StructItem;
    const placed = layoutGraph(systemGraph(system(SPARK))!).items.find(
      (each) => each.item.id === primitive.id,
    );
    const rows = fieldLines(primitive) * LINE_HEIGHT + 2 * FIELD_PADDING;

    expect(isPrimitive(primitive)).toBe(true);
    expect(placed?.height).toBe(HEADER_HEIGHT + 3 + PRIMITIVE_PREVIEW.height + 8 + rows);
  });
});
