import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { list, number, struct } from "../../../engine/drivers/__tests__/driverFixture";
import { layoutGraph } from "../../utils/driverLayout";
import { systemGraph } from "../../utils/systemGraph";
import { canvasPosition, layoutNodes, withMoves } from "../canvasNodes";
import { type EdgeCache, edgeRule, keptEdges } from "../graphEdges";
import { FAR_ZOOM, farZoom } from "../ZoomDetail";

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

  it("returns a layout nothing was dragged in as it is", () => {
    const nodes = layoutNodes(layout(6));

    const next = withMoves(nodes, new Map());

    next.forEach((node, index) => expect(node).toBe(nodes[index]));
  });

  it("moves an undragged frame away from a frame dragged onto it", () => {
    const nodes = layoutNodes(layout(2));
    const [first, second] = nodes.filter((node) => node.type === "frame");
    const moved = new Map([[second!.id, { x: first!.position.x + 10, y: first!.position.y + 10 }]]);

    const next = withMoves(nodes, moved);
    const dragged = next.find((node) => node.id === second!.id)!;
    const pushed = next.find((node) => node.id === first!.id)!;

    expect(dragged.position).toEqual({ x: first!.position.x + 10, y: first!.position.y + 10 });
    const clearX = pushed.position.x >= dragged.position.x + (dragged.width ?? 0);
    const clearY = pushed.position.y >= dragged.position.y + (dragged.height ?? 0);
    expect(clearX || clearY).toBe(true);
  });

  it("moves an item down off an item dragged over it, and grows the frame to contain it", () => {
    const nodes = layoutNodes(layout(1));
    const frame = nodes.find((node) => node.type === "frame")!;
    const [upper, lower] = nodes
      .filter((node) => node.parentId === frame.id)
      .sort(
        (left, right) => left.position.y - right.position.y || left.position.x - right.position.x,
      );
    const moved = new Map([[lower!.id, { x: upper!.position.x, y: upper!.position.y + 1 }]]);

    const next = withMoves(nodes, moved);
    const kept = next.find((node) => node.id === upper!.id)!;
    const pushed = next.find((node) => node.id === lower!.id)!;
    const grown = next.find((node) => node.id === frame.id)!;

    expect(kept.position).toEqual(upper!.position);
    expect(pushed.position.y).toBeGreaterThanOrEqual(kept.position.y + (kept.height ?? 0));
    expect(grown.height).toBeGreaterThanOrEqual(pushed.position.y + (pushed.height ?? 0));
  });
});

describe("keptEdges", () => {
  const look = (animated: boolean) => () => ({ animated, lane: undefined });

  it("keeps an edge's object while its look holds, and rebuilds it when the look changes", () => {
    const { edges } = layout(1);
    const cache: EdgeCache = new Map();

    const first = keptEdges(cache, edges, look(false));
    expect(keptEdges(cache, edges, look(false))).toEqual(first);
    expect(keptEdges(cache, edges, look(false))[0]).toBe(first[0]);
    expect(keptEdges(cache, edges, look(true))[0]).not.toBe(first[0]);
  });

  it("keeps an edge's object across a layout read again, whose edges are new objects", () => {
    const cache: EdgeCache = new Map();

    const first = keptEdges(cache, layout(1).edges, look(false));
    const again = keptEdges(cache, layout(1).edges, look(false));

    expect(first.length).toBeGreaterThan(0);
    again.forEach((edge, at) => expect(edge).toBe(first[at]));
  });

  it("holds only the edges it last answered with, and writes no width or opacity inline", () => {
    const cache: EdgeCache = new Map();
    const edges = layout(1).edges;

    keptEdges(cache, edges, look(false));
    const [only] = keptEdges(cache, edges.slice(0, 1), look(false));

    expect(cache.size).toBe(1);
    expect(only?.style).not.toHaveProperty("strokeWidth");
    expect(only?.style).not.toHaveProperty("opacity");
  });
});

describe("edgeRule", () => {
  beforeAll(() => {
    vi.stubGlobal("CSS", { escape: (text: string) => text });
  });
  afterAll(() => vi.unstubAllGlobals());

  it("draws every wire at rest with no focus", () => {
    expect(edgeRule("g", null, 2)).toBe(
      "#g .react-flow__edge .react-flow__edge-path{stroke-width:1.5px;opacity:var(--edge-rest,1);transition:opacity 120ms, stroke-width 120ms;}",
    );
  });

  it("thickens the lit wires and fades every other one under a focus", () => {
    const rule = edgeRule("g", new Set(["a", "b"]), 2);

    expect(rule).toContain(
      '#g .react-flow__edge:not([data-id="a"],[data-id="b"]) .react-flow__edge-path{opacity:0.2}',
    );
    expect(rule).toContain(
      '#g .react-flow__edge:is([data-id="a"],[data-id="b"]) .react-flow__edge-path{stroke-width:2.5px}',
    );
  });

  it("fades every wire under a focus that lights none", () => {
    expect(edgeRule("g", new Set(), 2)).toContain(
      "#g .react-flow__edge .react-flow__edge-path{opacity:0.2}",
    );
  });

  it("changes the look at once on a canvas of many wires", () => {
    expect(edgeRule("g", null, 301)).not.toContain("transition");
  });
});

describe("farZoom", () => {
  it("follows the zoom under the far threshold and holds at it above", () => {
    expect(farZoom({ transform: [0, 0, 0.25] })).toBe(0.25);
    expect(farZoom({ transform: [0, 0, FAR_ZOOM] })).toBe(FAR_ZOOM);
    expect(farZoom({ transform: [0, 0, 1.7] })).toBe(FAR_ZOOM);
  });
});
