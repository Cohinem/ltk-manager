import { describe, expect, it } from "vitest";

import type { VfxValue } from "@/lib/tauri";

import {
  list,
  number,
  struct,
  valueCurve,
  vector,
} from "../../../engine/drivers/__tests__/driverFixture";
import { layoutGraph } from "../driverLayout";
import { structLines } from "../entryLists";
import type { StructItem } from "../graphItems";
import { embedSockets } from "../socketEmbed";
import { systemGraph } from "../systemGraph";

const CONSTANT = struct("VfxFloatDynamicProperty", {
  Float: struct("VfxFloatConstantDriver", { Float: number(2) }),
});

const SUM = struct("VfxFloatDynamicProperty", {
  Float: struct("VfxAddFloatDriver", {
    params: list(
      struct("VfxFloatConstantDriver", { Float: number(1) }),
      struct("VfxFloatConstantDriver", { Float: number(3) }),
    ),
  }),
});

function lifetime(rate: VfxValue) {
  const shimmer = struct("VfxShimmerEmitterDefinitionData", {
    VfxComponents: struct("VfxComponents", {
      LifetimeComponent: struct("VfxLifetimeComponent", {
        SpawnBehavior: struct("0x31beb841", { EmissionRate: rate }),
      }),
    }),
  });
  return systemGraph(
    struct("VfxSystemDefinitionData", { shimmerEmitterDefinitionData: list(shimmer) }),
  )!;
}

const componentOf = (tree: ReturnType<typeof lifetime>) => tree.inputs[0]!.tree.inputs[0]!.tree;

describe("embedSockets", () => {
  it("moves a constant into the socket it feeds, off the tree and the layout", () => {
    const tree = lifetime(CONSTANT);
    const shown = embedSockets(tree, new Set());
    const component = componentOf(shown);

    expect(component.inputs).toEqual([]);
    expect(component.item.ports[0]?.embed).toMatchObject({
      type: "driver",
      node: { type: "constant", value: [2] },
    });
    expect(layoutGraph(shown).items.some((each) => each.item.type === "driver")).toBe(false);
  });

  it("keeps a popped driver as a node", () => {
    const tree = lifetime(CONSTANT);
    const driver = componentOf(tree).inputs[0]!.tree.item.id;
    const component = componentOf(embedSockets(tree, new Set([driver])));

    expect(component.inputs).toHaveLength(1);
    expect(component.item.ports[0]?.embed).toBeUndefined();
  });

  it("embeds an operator's constant params, and keeps the operator a node", () => {
    const component = componentOf(embedSockets(lifetime(SUM), new Set()));
    const operator = component.inputs[0]?.tree;

    expect(operator?.item).toMatchObject({ type: "driver", node: { type: "operator" } });
    expect(operator?.inputs).toEqual([]);
    expect(
      operator?.item.ports.map((port) =>
        port.embed?.type === "driver" ? port.embed.node.type : null,
      ),
    ).toEqual(["constant", "constant"]);
  });

  it("moves a keyed value into the master's socket, and keeps a popped one as a node", () => {
    const emitter = struct("VfxEmitterDefinitionData", {
      birthColor: valueCurve("ValueColor", vector(1, 1, 1, 1), [
        [0, vector(1, 0, 0, 1)],
        [1, vector(0, 0, 1, 1)],
      ]),
    });
    const tree = systemGraph(
      struct("VfxSystemDefinitionData", { complexEmitterDefinitionData: list(emitter) }),
    )!;
    const masterOf = (shown: typeof tree) => shown.inputs[0]!.tree;
    const value = masterOf(tree).inputs[0]!.tree.item.id;

    const embedded = masterOf(embedSockets(tree, new Set()));
    expect(embedded.inputs).toEqual([]);
    expect(embedded.item.ports[0]?.embed).toMatchObject({ type: "value", kind: "vec4" });

    const popped = masterOf(embedSockets(tree, new Set([value])));
    expect(popped.inputs).toHaveLength(1);
    expect(popped.item.ports[0]?.embed).toBeUndefined();
  });

  it("embeds a short list of leaves in its socket, and counts its rows under the socket", () => {
    const shape = struct("VfxShapeLegacy", {
      emitRotationAxes: list(vector(0, 1, 0), vector(1, 0, 0)),
    });
    /* A struct field the master keeps a node for, since the Geometry node takes the shapes. */
    const emitter = struct("VfxEmitterDefinitionData", { emissionSurfaceDefinition: shape });
    const tree = systemGraph(
      struct("VfxSystemDefinitionData", { complexEmitterDefinitionData: list(emitter) }),
    )!;
    const shapeNode = (graph: typeof tree) => graph.inputs[0]!.tree.inputs[0]!.tree;

    const before = shapeNode(tree).item as StructItem;
    const embedded = shapeNode(embedSockets(tree, new Set()));
    const port = embedded.item.ports[0];

    expect(port?.embed).toMatchObject({ type: "struct", shape: "list" });
    expect(embedded.inputs).toEqual([]);
    expect(structLines(embedded.item as StructItem)).toBe(structLines(before) + 2 + 1);

    const popped = shapeNode(embedSockets(tree, new Set([port!.embed!.id])));
    expect(popped.inputs).toHaveLength(1);
  });
});
