import { describe, expect, it } from "vitest";

import type { LayoutEdge } from "../driverLayout";
import { chainThrough, reach } from "../graphChain";

function edge(source: string, target: string): LayoutEdge {
  return { id: `${source}->${target}`, source, target, port: target, kind: null };
}

/* Two constants into an add, the add and a curve into two components of one emitter. */
const EDGES = [
  edge("a", "add"),
  edge("b", "add"),
  edge("add", "rate"),
  edge("curve", "color"),
  edge("rate", "emitter"),
  edge("color", "emitter"),
  edge("emitter", "preview"),
];

describe("chainThrough", () => {
  it("lights what feeds an item and what it feeds, and nothing beside them", () => {
    const chain = chainThrough(["add"], EDGES);

    expect([...chain.items].sort()).toEqual(["a", "add", "b", "emitter", "preview", "rate"]);
    expect(chain.edges.has("curve->color")).toBe(false);
    expect(chain.edges.has("color->emitter")).toBe(false);
    expect(chain.edges.has("emitter->preview")).toBe(true);
  });

  it("walks past an item another focus already reached", () => {
    const chain = chainThrough(["a", "preview"], EDGES);

    expect(chain.items.has("curve")).toBe(true);
    expect(chain.edges.has("curve->color")).toBe(true);
  });
});

describe("reach", () => {
  it("collects an item's inputs, the item included", () => {
    expect([...reach(["rate"], EDGES, "inputs")].sort()).toEqual(["a", "add", "b", "rate"]);
  });
});
