import { describe, expect, it } from "vitest";

import type { LayoutEdge } from "../driverLayout";
import { type EdgeEnds, edgeLanes } from "../edgeLanes";

function edge(source: string): LayoutEdge {
  return { id: `${source}->t`, source, target: "t", port: source, kind: null };
}

describe("edgeLanes", () => {
  it("turns an edge falling to a lower port nearer its source, so falling edges nest", () => {
    const ends: Record<string, EdgeEnds> = { a: { from: 0, to: 200 }, b: { from: 50, to: 300 } };
    const lanes = edgeLanes([edge("a"), edge("b")], (each) => ends[each.source] ?? null);

    expect(lanes.get("b->t")).toBeLessThan(lanes.get("a->t")!);
  });

  it("turns a rising edge to a lower port nearer its port", () => {
    const ends: Record<string, EdgeEnds> = { a: { from: 400, to: 100 }, b: { from: 500, to: 200 } };
    const lanes = edgeLanes([edge("a"), edge("b")], (each) => ends[each.source] ?? null);

    expect(lanes.get("b->t")).toBeGreaterThan(lanes.get("a->t")!);
  });

  it("turns a lone edge halfway and leaves an unplaced one out", () => {
    const lanes = edgeLanes([edge("a"), edge("b")], (each) =>
      each.source === "a" ? { from: 0, to: 10 } : null,
    );

    expect(lanes.get("a->t")).toBe(0.5);
    expect(lanes.has("b->t")).toBe(false);
  });
});
