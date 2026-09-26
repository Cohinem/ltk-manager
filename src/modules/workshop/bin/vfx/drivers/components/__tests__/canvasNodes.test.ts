import { describe, expect, it } from "vitest";

import { list, number, struct } from "../../../engine/drivers/__tests__/driverFixture";
import { layoutGraph } from "../../utils/driverLayout";
import { systemGraph } from "../../utils/systemGraph";
import { canvasPosition, layoutNodes, withMoves } from "../canvasNodes";
import { keptEdges } from "../graphEdges";

const RATE = struct("VfxFloatDynamicProperty", {
  Float: struct("VfxFloatConstantDriver", { Float: number(2) }),
});

function layout(count: number) {
  const emitters = Array.from({ length: count }, (_, at) =>
    struct("VfxShimmerEmitterDefinitionData", {
      emitterName: { type: "string", value: `Grid${at}` },
      VfxComponents: struct("VfxComponents", {
        LifetimeComponent: struct("VfxLifetimeComponent", {
          SpawnBehavior: struct("0x31beb841", { EmissionRate: RATE }),
        }),
      }),
    }),
  );
  const tree = systemGraph(
    struct("VfxSystemDefinitionData", { shimmerEmitterDefinitionData: list(...emitters) }),
  );
  if (tree === null) throw new Error("the system holds no graph");
  return layoutGraph(tree);
}

describe("layoutNodes", () => {
  it("lists each frame before the items it holds, and places them within it", () => {
    const placed = layout(2);
    const nodes = layoutNodes(placed);
    const order = new Map(nodes.map((node, index) => [node.id, index]));

    for (const node of nodes) {
      if (node.parentId === undefined) continue;
      expect(order.get(node.parentId)!).toBeLessThan(order.get(node.id)!);

      const item = placed.items.find((each) => each.item.id === node.id)!;
      expect(canvasPosition(nodes, node.id)).toEqual({ x: item.x, y: item.y });
    }
  });
});

describe("withMoves", () => {
  it("keeps a dragged frame's items where they sit in it, and grows it to a dragged item", () => {
    const nodes = layoutNodes(layout(1));
    const frame = nodes.find((node) => node.type === "frame")!;
    const child = nodes.find((node) => node.parentId === frame.id)!;
    const moved = new Map([
      [frame.id, { x: 5000, y: 4000 }],
      [child.id, { x: child.position.x + 900, y: child.position.y }],
    ]);

    const next = withMoves(nodes, moved);
    const grown = next.find((node) => node.id === frame.id)!;

    expect(canvasPosition(next, child.id)).toEqual({
      x: 5000 + child.position.x + 900,
      y: 4000 + child.position.y,
    });
    expect(grown.width).toBeGreaterThanOrEqual(child.position.x + 900 + (child.width ?? 0));
  });
});

describe("keptEdges", () => {
  it("keeps an edge's object while its look holds, and rebuilds it when the look changes", () => {
    const { edges } = layout(1);
    const look = (lit: boolean) => () => ({
      lit,
      faded: false,
      animated: false,
      lane: undefined,
    });

    const first = keptEdges(edges, look(false));
    expect(keptEdges(edges, look(false))).toEqual(first);
    expect(keptEdges(edges, look(false))[0]).toBe(first[0]);
    expect(keptEdges(edges, look(true))[0]).not.toBe(first[0]);
  });
});
