import { describe, expect, it } from "vitest";

import type { VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../../shared/utils/binHash";
import {
  bool,
  list,
  number,
  struct,
  vector,
} from "../../../engine/drivers/__tests__/driverFixture";
import fixture from "../../../engine/drivers/__tests__/hallOfLegends.fixture.json";
import { FRAME_HEADER_HEIGHT, FRAME_PADDING, isMaterial, layoutGraph } from "../driverLayout";
import { systemGraph } from "../systemGraph";

const GRAPHS = (fixture as unknown as { graphs: { graph: VfxValue }[] }).graphs;

/** The widest a column of nodes draws, however long its text. */
const WIDEST_NODE = 440;

/** A shimmer emitter whose lifetime component holds `rate` and whose physics holds `scale`. */
function emitter(name: string, rate: VfxValue, scale: VfxValue): VfxValue {
  return struct("VfxShimmerEmitterDefinitionData", {
    emitterName: { type: "string", value: name },
    disabled: bool(true),
    VfxComponents: struct("VfxComponents", {
      LifetimeComponent: struct("VfxLifetimeComponent", {
        SpawnBehavior: struct("0x31beb841", { EmissionRate: rate }),
      }),
      PhysicsComponent: struct("VfxModularPhysicsComponent", {
        Modifiers: list(struct("0x710b2bc2", { InitialScale: scale })),
      }),
      GeometryComponent: struct("VfxGeometryComponent"),
    }),
  });
}

const RATE = struct("VfxFloatDynamicProperty", {
  Float: struct("VfxFloatConstantDriver", { Float: number(2) }),
});

const SCALE = struct("VfxVector3DynamicProperty", {
  Vector3: struct("VfxVector3ConstantDriver", { Vector3: vector(1, 1, 1) }),
});

function system(...emitters: VfxValue[]): VfxValue {
  return struct("VfxSystemDefinitionData", { shimmerEmitterDefinitionData: list(...emitters) });
}

describe("systemGraph", () => {
  it("reads a system without shimmer emitters as no graph", () => {
    expect(systemGraph(struct("VfxSystemDefinitionData"))).toBeNull();
  });

  it("feeds the preview with each emitter, and each emitter with its components", () => {
    const tree = systemGraph(system(emitter("Grid", RATE, SCALE), emitter("Grid3", RATE, SCALE)));

    expect(tree?.item).toMatchObject({
      type: "preview",
      ports: [{ label: "Grid" }, { label: "Grid3" }],
    });
    expect(tree?.inputs[0]?.tree.item).toMatchObject({
      type: "emitter",
      name: "Grid",
      disabled: true,
      ports: [
        { label: "LifetimeComponent" },
        { label: "PhysicsComponent" },
        { label: "GeometryComponent" },
      ],
    });
  });

  it("feeds each component with the driver graph of every dynamic property under it", () => {
    const tree = systemGraph(system(emitter("Grid", RATE, SCALE)));
    const [lifetime, physics, geometry] = tree?.inputs[0]?.tree.inputs ?? [];

    expect(lifetime?.tree.item).toMatchObject({
      type: "component",
      ports: [{ label: "SpawnBehavior.EmissionRate", kind: "float" }],
    });
    expect(lifetime?.tree.inputs[0]?.tree.item).toMatchObject({
      type: "driver",
      node: { type: "constant", value: [2] },
    });
    expect(physics?.tree.item).toMatchObject({
      ports: [{ label: "Modifiers[0].InitialScale", kind: "vec3" }],
    });
    expect(geometry?.tree.item).toMatchObject({ ports: [] });
  });

  it("draws a component's structs as sections, its fields in place and its graphs where they sit", () => {
    const lifetime = struct("VfxLifetimeComponent", {
      SpawnBehavior: struct("0x31beb841", { EmissionRate: RATE, Burst: bool(true) }),
      Looping: bool(false),
    });
    const physics = struct("VfxModularPhysicsComponent", {
      Modifiers: list(struct("0x710b2bc2", { InitialScale: SCALE })),
    });
    const shimmer = struct("VfxShimmerEmitterDefinitionData", {
      VfxComponents: struct("VfxComponents", {
        LifetimeComponent: lifetime,
        PhysicsComponent: physics,
      }),
    });
    const [first, second] = systemGraph(system(shimmer))?.inputs[0]?.tree.inputs ?? [];
    const lines = (tree: typeof first) =>
      tree?.tree.item.type === "component" ? tree.tree.item.lines : [];

    expect(lines(first)).toMatchObject([
      { type: "section", name: "SpawnBehavior", depth: 0, index: null },
      {
        type: "input",
        name: "EmissionRate",
        depth: 1,
        kind: "float",
        port: first?.tree.item.ports[0]?.id,
      },
      { type: "field", name: "Burst", depth: 1, holderRows: 2 },
      { type: "field", name: "Looping", depth: 0, holderRows: 2 },
    ]);
    expect(lines(second)).toMatchObject([
      { type: "section", name: "Modifiers", depth: 0, index: null },
      { type: "section", name: "Modifiers", depth: 1, index: 0 },
      { type: "input", name: "InitialScale", depth: 2, kind: "vec3" },
    ]);
  });

  it("feeds a component's material from a material node of its own, which folds to its header and shape", () => {
    const def = struct("StaticMaterialDef", { name: { type: "string", value: "Glow" } });
    if (def.type === "struct") {
      def.class = "StaticMaterialDef";
      def.object = { entry: "0x0000beef", name: null };
    }
    const material = struct("VfxMaterialContainer", { Material: def });
    const shimmer = struct("VfxShimmerEmitterDefinitionData", {
      VfxComponents: struct("VfxComponents", {
        RenderComponent: struct("VfxMaterialRenderComponent", { Material: material }),
      }),
    });
    const tree = systemGraph(system(shimmer));
    const render = tree?.inputs[0]?.tree.inputs[0]?.tree;
    const node = render?.inputs[0]?.tree.item;
    if (render?.item.type !== "component" || node?.type !== "struct") {
      throw new Error("the render component holds no material node");
    }

    expect(render.item.lines).toMatchObject([
      { type: "material", name: "Material", className: "StaticMaterialDef", port: node.id },
    ]);
    expect(isMaterial(node)).toBe(true);
    expect(node.material).toEqual({ type: "linked", entry: "0x0000beef" });

    const open = layoutGraph(tree!).items.find((each) => each.item.id === node.id);
    const folded = layoutGraph(tree!, new Set([node.id])).items.find(
      (each) => each.item.id === node.id,
    );
    expect(folded!.height).toBeLessThan(open!.height);
  });

  it("reads an embedded material at its property path under the system", () => {
    const def = struct("StaticMaterialDef", { name: { type: "string", value: "Glow" } });
    const material = struct("VfxMaterialContainer", { Material: def });
    const shimmer = struct("VfxShimmerEmitterDefinitionData", {
      VfxComponents: struct("VfxComponents", {
        RenderComponent: struct("VfxMaterialRenderComponent", { Material: material }),
      }),
    });
    const tree = systemGraph(system(shimmer));
    const node = tree?.inputs[0]?.tree.inputs[0]?.tree.inputs[0]?.tree.item;
    if (node?.type !== "struct") throw new Error("the render component holds no material node");

    expect(node.material).toEqual({
      type: "embedded",
      entry: null,
      path: `${node.wire}.${nameHash("Material").slice(2)}`,
    });
  });

  it("draws the items of a material's lists as lines of the material node", () => {
    const param = (name: string) =>
      struct("StaticMaterialShaderParamDef", {
        name: { type: "string", value: name },
        value: vector(1, 0.5, 0, 1),
      });
    const def = struct("StaticMaterialDef", {
      paramValues: list(param("Color"), param("Tint")),
      switches: list(struct("StaticMaterialSwitchDef", { name: { type: "string", value: "FOG" } })),
    });
    const shimmer = struct("VfxShimmerEmitterDefinitionData", {
      VfxComponents: struct("VfxComponents", {
        RenderComponent: struct("VfxMaterialRenderComponent", { Material: def }),
      }),
    });
    const tree = systemGraph(system(shimmer));
    const material = tree?.inputs[0]?.tree.inputs[0]?.tree.inputs[0]?.tree;
    if (material?.item.type !== "struct") throw new Error("the component holds no material node");

    expect(material.inputs).toEqual([]);
    expect(material.item.rows).toMatchObject([
      {
        name: "paramValues",
        input: null,
        entries: [
          { key: "Color", text: "(1, 0.5, 0, 1)" },
          { key: "Tint", text: "(1, 0.5, 0, 1)" },
        ],
      },
      { name: "switches", input: null, entries: [{ key: "FOG", text: "" }] },
    ]);
  });

  it("feeds an operator with each params entry, and edits a clamp's bounds in place", () => {
    const one = struct("VfxFloatConstantDriver", { Float: number(1) });
    const rate = struct("VfxFloatDynamicProperty", {
      Float: struct("VfxClampFloatDriver", {
        Param: struct("VfxAddFloatDriver", { params: list(one, one) }),
        High: number(4),
      }),
    });
    const tree = systemGraph(system(emitter("Grid", rate, SCALE)));
    const clamp = tree?.inputs[0]?.tree.inputs[0]?.tree.inputs[0]?.tree;
    const add = clamp?.inputs[0]?.tree;
    const hex = (name: string) => nameHash(name).slice(2);

    expect(clamp?.item).toMatchObject({
      node: { type: "operator", operator: "clamp" },
      ports: [{ label: "Param", kind: "float" }],
      leaves: [
        { holder: clamp?.item.wire, field: nameHash("Low") },
        { holder: clamp?.item.wire, field: nameHash("High") },
      ],
    });
    expect(add?.item).toMatchObject({
      node: { operator: "add" },
      wire: `${clamp?.item.wire}.${hex("Param")}`,
      ports: [{ label: "params[0]" }, { label: "params[1]" }],
    });
    expect(add?.inputs[1]?.tree.item.wire).toBe(`${add?.item.wire}.${hex("params")}[1]`);
  });
});

describe("layoutGraph", () => {
  it("places the preview rightmost and every input left of what it feeds", () => {
    const tree = systemGraph(system(emitter("Grid", RATE, SCALE)));
    if (tree === null) throw new Error("the system holds no graph");
    const { items, edges } = layoutGraph(tree);
    const placed = new Map(items.map((each) => [each.item.id, each]));

    const preview = items.find((each) => each.item.type === "preview");
    expect(preview && preview.x + preview.width).toBe(
      Math.max(...items.map((each) => each.x + each.width)),
    );
    for (const edge of edges) {
      const source = placed.get(edge.source);
      const target = placed.get(edge.target);
      expect(source && target && source.x + source.width < target.x, edge.id).toBe(true);
      expect(
        target?.item.ports.some((port) => port.id === edge.port),
        edge.id,
      ).toBe(true);
    }
  });

  it("draws each column at one width, and a component with no graphs as its header", () => {
    const tree = systemGraph(system(emitter("Grid", RATE, SCALE)));
    if (tree === null) throw new Error("the system holds no graph");
    const { items } = layoutGraph(tree);

    const columns = new Map<number, Set<number>>();
    for (const each of items) {
      const right = each.x + each.width;
      columns.set(right, (columns.get(right) ?? new Set()).add(each.width));
    }
    for (const widths of columns.values()) expect(widths.size).toBe(1);

    const heights = new Map(items.map((each) => [each.item.id, each.height]));
    expect(heights.get("e0/GeometryComponent")).toBeLessThan(heights.get("e0/LifetimeComponent")!);
  });

  it("packs many emitters into rows rather than one column, without overlap", () => {
    const names = Array.from({ length: 9 }, (_, at) => `Grid${at}`);
    const tree = systemGraph(system(...names.map((name) => emitter(name, RATE, SCALE))));
    if (tree === null) throw new Error("the system holds no graph");
    const emitters = layoutGraph(tree).items.filter((each) => each.item.type === "emitter");

    expect(new Set(emitters.map((each) => each.y)).size).toBeGreaterThan(1);
    expect(new Set(emitters.map((each) => each.x)).size).toBeGreaterThan(1);
    for (const one of emitters) {
      for (const other of emitters) {
        if (one === other) continue;
        const apart =
          one.x + one.width <= other.x ||
          other.x + other.width <= one.x ||
          one.y + one.height <= other.y ||
          other.y + other.height <= one.y;
        expect(apart, `${one.item.id} and ${other.item.id}`).toBe(true);
      }
    }
  });

  it("frames each emitter's block, holding its items clear of the frame's header", () => {
    const names = Array.from({ length: 4 }, (_, at) => `Grid${at}`);
    const tree = systemGraph(system(...names.map((name) => emitter(name, RATE, SCALE))));
    if (tree === null) throw new Error("the system holds no graph");
    const { items, frames } = layoutGraph(tree);

    expect(frames.map((frame) => frame.root.id)).toEqual(
      tree.inputs.map((each) => each.tree.item.id),
    );
    for (const frame of frames) {
      const held = items.filter((each) => each.frame === frame.id);
      expect(held).toHaveLength(frame.count);
      for (const each of held) {
        expect(each.x).toBeGreaterThanOrEqual(frame.x + FRAME_PADDING);
        expect(each.y).toBeGreaterThanOrEqual(frame.y + FRAME_HEADER_HEIGHT);
        expect(each.x + each.width).toBeLessThanOrEqual(frame.x + frame.width);
        expect(each.y + each.height).toBeLessThanOrEqual(frame.y + frame.height);
      }
      for (const other of frames) {
        if (other === frame) continue;
        const apart =
          frame.x + frame.width <= other.x ||
          other.x + other.width <= frame.x ||
          frame.y + frame.height <= other.y ||
          other.y + other.height <= frame.y;
        expect(apart, `${frame.id} and ${other.id}`).toBe(true);
      }
    }
    expect(items.find((each) => each.item.type === "preview")?.frame).toBeUndefined();
  });

  it("leaves the preview and its edges off a board drawn without it", () => {
    const tree = systemGraph(system(emitter("Grid", RATE, SCALE)));
    if (tree === null) throw new Error("the system holds no graph");
    const { items, edges } = layoutGraph(tree, undefined, false);

    expect(items.some((each) => each.item.type === "preview")).toBe(false);
    expect(edges.some((edge) => edge.target === tree.item.id)).toBe(false);
    expect(items.some((each) => each.item.type === "emitter")).toBe(true);
  });

  it("lays out every Hall of Legends graph the same way on every read", () => {
    for (const { graph } of GRAPHS) {
      const tree = systemGraph(system(emitter("Grid", graph, SCALE)));
      if (tree === null) throw new Error("the system holds no graph");
      expect(layoutGraph(tree)).toEqual(layoutGraph(tree));
    }
  });

  it("sizes each node by its measured text, within a column's bounds", () => {
    const tree = systemGraph(system(emitter("Grid", RATE, SCALE)));
    if (tree === null) throw new Error("the system holds no graph");
    const widths = (measure: () => number) =>
      new Map(
        layoutGraph(tree, undefined, true, measure).items.map((each) => [each.item.id, each.width]),
      );

    const narrow = widths(() => 0);
    const wide = widths(() => 1000);
    for (const [id, width] of narrow) expect(width, id).toBeLessThanOrEqual(wide.get(id)!);
    expect([...narrow].some(([id, width]) => width < wide.get(id)!)).toBe(true);
    for (const [id, width] of wide) {
      if (id !== tree.item.id) expect(width, id).toBe(WIDEST_NODE);
    }
  });

  it("draws a class the registry does not read as a driver holding its fields", () => {
    const unknown = struct("VfxFloatDynamicProperty", {
      Float: struct("VfxFloatTimeDriver", { Time: number(7) }),
    });
    const tree = systemGraph(system(emitter("Grid", unknown, SCALE)));
    if (tree === null) throw new Error("the system holds no graph");
    const driver = layoutGraph(tree).items.find(
      (each) => each.item.type === "driver" && each.item.node.type === "unknown",
    );

    expect(driver?.item).toMatchObject({
      node: { value: { fields: [{ name: "Time" }] } },
      diagnostics: [{ code: "unknownClass", level: "unsupported" }],
    });
  });
});
