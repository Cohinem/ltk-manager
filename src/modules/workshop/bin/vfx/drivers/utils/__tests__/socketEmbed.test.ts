import { describe, expect, it } from "vitest";

import type { VfxValue } from "@/lib/tauri";

import { list, number, struct } from "../../../engine/drivers/__tests__/driverFixture";
import { layoutGraph } from "../driverLayout";
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
    expect(operator?.item.ports.map((port) => port.embed?.node.type)).toEqual([
      "constant",
      "constant",
    ]);
  });
});
