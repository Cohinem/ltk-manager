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
  layoutGraph,
  LINE_HEIGHT,
  previewHeight,
} from "../driverLayout";
import type { MasterItem, RenderItem, StructItem } from "../graphItems";
import { systemGraph } from "../systemGraph";
import type { MeasureText } from "../textWidth";

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

/** A field of the master node or of its Texture or Geometry node. */
function fieldOf(item: MasterItem, name: string) {
  return [
    ...item.groups.flatMap((each) => each.fields),
    ...(item.render?.fields ?? []),
    ...(item.geometry?.fields ?? []),
  ].find((each) => each.hash === nameHash(name));
}

describe("classicEmitters", () => {
  it("draws a complex emitter as a master node under the inspector's groups, one Texture", () => {
    const { item } = master(system(SPARK));

    expect(item).toMatchObject({ id: "c0", name: "Spark", simple: false, rowCount: 5 });
    expect(item.groups.map((each) => each.group)).toEqual([
      "emission",
      "birth",
      "primitive",
      "material",
      "effects",
    ]);
    expect(fieldOf(item, "rate")?.input).toBeNull();
  });

  it("gives a keyed value and every struct a node, the primitive in the Geometry node", () => {
    const { item, tree } = master(system(SPARK));

    expect(fieldOf(item, "birthColor")?.input).toMatchObject({
      type: "value",
      kind: "vec4",
      wire: `${hex("complexEmitterDefinitionData")}[0].${hex("birthColor")}`,
    });
    expect(fieldOf(item, "primitive")?.input).toMatchObject({ type: "struct", shape: "struct" });
    expect(tree.inputs.map((each) => each.tree.item.type)).toEqual(["value", "render", "struct"]);
    expect(item.geometry?.role).toBe("geometry");
  });

  it("folds a struct's lone struct into it, and gives a list's items nodes of their own", () => {
    const { item, tree } = master(system(SPARK));
    const primitive = fieldOf(item, "primitive")?.input as StructItem;
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

  it("sizes a master node by its group headings and fields", () => {
    const { item } = master(system(SPARK));
    const placed = layoutGraph(systemGraph(system(SPARK))!).items.find(
      (each) => each.item.id === "c0",
    );

    /* Five headings, three fields, and the Geometry group's socket line. */
    expect(fieldLines(item)).toBe(5 + 3 + 1);
    expect(placed?.height).toBeGreaterThan(fieldLines(item) * LINE_HEIGHT);
  });

  it("draws a Geometry node's preview shorter than a master node's of the same width", () => {
    const { item } = master(system(SPARK));

    expect(item.geometry).not.toBeNull();
    expect(previewHeight(item.geometry!, 418)).toBe(200);
    expect(previewHeight(item, 418)).toBe(300);
  });

  it("draws a master node's preview at 4:3 of the node's width, folded or open", () => {
    const { item } = master(system(SPARK));
    const tree = systemGraph(system(SPARK))!;
    const open = layoutGraph(tree).items.find((each) => each.item.id === "c0")!;
    const folded = layoutGraph(tree, new Set(["c0"])).items.find((each) => each.item.id === "c0")!;
    const rows = fieldLines(item) * LINE_HEIGHT + 2 * FIELD_PADDING;

    expect(previewHeight(item, 418)).toBe(300);
    expect(folded.width).toBeLessThan(open.width);
    expect(folded.height).toBe(HEADER_HEIGHT + 3 + previewHeight(item, folded.width) + 8);
    expect(open.height).toBe(HEADER_HEIGHT + 3 + previewHeight(item, open.width) + 8 + rows);
  });

  it("measures a master node's name column from its field labels, within its bounds", () => {
    const tree = systemGraph(system(SPARK))!;
    const placed = (measure: MeasureText) =>
      layoutGraph(tree, undefined, true, measure).items.find((each) => each.item.id === "c0");
    const narrow = placed(() => 0);
    const wide = placed((text) => text.length * 100);

    expect(narrow?.nameWidth).toBe(160);
    expect(wide?.nameWidth).toBe(272);
    expect(wide!.width - narrow!.width).toBe(272 - 160);
  });

  it("moves a Geometry node taller than its one input clear of the node above it", () => {
    const keyed = valueCurve("ValueVector3", vector(0, 0, 0), [
      [0, vector(0, 0, 0)],
      [1, vector(1, 1, 1)],
    ]);
    const shape = struct("VfxShapeLegacy", { emitOffset: keyed });
    if (shape.type === "struct") shape.class = "VfxShapeLegacy";
    const emitter = struct("VfxEmitterDefinitionData", {
      emitterName: { type: "string", value: "Shaped" },
      birthScale0: keyed,
      SpawnShape: shape,
    });
    const { items } = layoutGraph(systemGraph(system(emitter))!);
    const placed = items.find((each) => each.item.type === "render");

    expect(placed?.height).toBeGreaterThan(200);
    for (const one of items) {
      for (const other of items) {
        if (one === other || one.x !== other.x) continue;
        const apart = one.y + one.height <= other.y || other.y + other.height <= one.y;
        expect(apart, `${one.item.id} and ${other.item.id}`).toBe(true);
      }
    }
  });

  it("gathers the orientation, the spawn shape and the primitive in a Geometry node", () => {
    const emitter = struct("VfxEmitterDefinitionData", {
      primitive: struct("VfxPrimitiveArbitraryQuad"),
      SpawnShape: struct("VfxShapeBox", { size: vector(1, 1, 1) }),
      FlexShapeDefinition: struct("VfxFlexShapeDefinitionData"),
      isDirectionOriented: { type: "bool", value: true },
      bindWeight: valueCurve("ValueFloat", number(1)),
    });
    const { item, tree } = master(system(emitter));
    const geometry = item.geometry as RenderItem;
    const placed = layoutGraph(systemGraph(system(emitter))!).items.find(
      (each) => each.item.id === geometry.id,
    );
    const rows = fieldLines(geometry) * LINE_HEIGHT + 2 * FIELD_PADDING;

    expect(geometry.id).toBe("c0/geometry");
    expect(geometry.fields.map((each) => each.hash)).toEqual([
      nameHash("isDirectionOriented"),
      nameHash("SpawnShape"),
      nameHash("FlexShapeDefinition"),
      nameHash("primitive"),
    ]);
    expect(item.groups.find((each) => each.group === "primitive")?.fields).toEqual([]);
    expect(fieldOf(item, "bindWeight")).toBeDefined();
    expect(tree.inputs.some((each) => each.tree.item.id === geometry.id)).toBe(true);
    expect(placed?.height).toBe(
      HEADER_HEIGHT + 3 + previewHeight(geometry, placed!.width) + 8 + rows,
    );
  });

  it("gathers the texture and render fields in a Texture node, and the primitive in Geometry", () => {
    const emitter = struct("VfxEmitterDefinitionData", {
      blendMode: number(4),
      texture: { type: "asset", path: "assets/spark.tex", asset: null },
      primitive: struct("VfxPrimitiveCameraTrail"),
    });
    const { item, tree } = master(system(emitter));
    const render = tree.inputs[1]?.tree;

    expect(item.groups.map((each) => each.group)).toEqual(["primitive", "texture", "effects"]);
    expect(item.render?.fields.map((each) => each.hash)).toEqual([
      nameHash("texture"),
      nameHash("blendMode"),
    ]);
    expect(fieldOf(item, "texture")?.input).toMatchObject({ type: "file" });
    expect(tree.inputs.map((each) => each.tree.item.type)).toEqual(["render", "render"]);
    expect(render?.inputs).toEqual([]);
  });

  it("folds a distortion and a reflection into the Texture node as sections", () => {
    const emitter = struct("VfxEmitterDefinitionData", {
      texture: { type: "asset", path: "assets/spark.tex", asset: null },
      distortionDefinition: struct("VfxDistortionDefinitionData", { distortion: number(0.5) }),
      reflectionDefinition: struct("VfxReflectionDefinitionData", { fresnel: number(1) }),
    });
    const { item } = master(system(emitter));

    expect(item.groups.find((each) => each.group === "effects")?.fields).toEqual([]);
    expect(item.render?.fields.slice(-2).map((each) => each.hash)).toEqual([
      nameHash("distortionDefinition"),
      nameHash("reflectionDefinition"),
    ]);
  });

  it("folds an alpha erosion into the Texture node, which takes over its inputs", () => {
    const emitter = struct("VfxEmitterDefinitionData", {
      texture: { type: "asset", path: "assets/spark.tex", asset: null },
      alphaErosionDefinition: struct("VfxAlphaErosionDefinitionData", {
        erosionDriveCurve: valueCurve("ValueFloat", number(0), [
          [0, number(0)],
          [1, number(1)],
        ]),
      }),
    });
    const { item, tree } = master(system(emitter));
    const render = tree.inputs.find((each) => each.tree.item.type === "render")?.tree;
    const erosion = fieldOf(item, "alphaErosionDefinition");

    expect(item.groups.find((each) => each.group === "effects")?.fields).toEqual([]);
    expect(item.render?.fields.at(-1)?.hash).toBe(nameHash("alphaErosionDefinition"));
    expect(erosion?.input).toMatchObject({ type: "struct" });
    expect(render?.inputs.map((each) => each.tree.item.type)).toEqual(["value"]);
    /* The texture, the erosion's heading and its curve row. */
    expect(render === undefined ? 0 : fieldLines(render.item as never)).toBe(3);
  });

  it("gives each force its own node on an input of the emitter", () => {
    const noise = struct("VfxFieldNoiseDefinitionData", { frequency: number(2) });
    const drag = struct("VfxFieldDragDefinitionData", { strength: number(1) });
    const emitter = struct("VfxEmitterDefinitionData", {
      fieldCollectionDefinition: struct("VfxFieldCollectionDefinitionData", {
        fieldDragDefinitions: list(drag, drag),
        fieldNoiseDefinitions: list(noise),
      }),
    });
    const { item, tree } = master(system(emitter));
    const forces = fieldOf(item, "fieldCollectionDefinition")?.forces ?? [];
    const collection = `${hex("complexEmitterDefinitionData")}[0].${hex("fieldCollectionDefinition")}`;

    expect(forces.map((each) => each.label)).toEqual(["Noise [0]", "Drag [0]", "Drag [1]"]);
    expect(forces[2]?.wire).toBe(`${collection}.${hex("fieldDragDefinitions")}[1]`);
    expect(tree.inputs.map((each) => each.tree.item)).toEqual(forces);
    expect(fieldLines(item)).toBe(1 + 3);
  });
});
