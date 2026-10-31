import { BufferAttribute, BufferGeometry } from "three";
import { describe, expect, it, vi } from "vitest";

import { createEdgeGeometry, uniqueEdges, writeEdgeGroups } from "../edgeGeometry";

/** Two triangles over a unit square, sharing the edge from vertex 0 to vertex 2. */
const SQUARE = [0, 1, 2, 0, 2, 3];
const CORNERS = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0];

function segments(indices: Uint32Array): string[] {
  return Array.from({ length: indices.length / 2 }, (_, at) => {
    return `${indices[at * 2]}-${indices[at * 2 + 1]}`;
  }).sort();
}

describe("uniqueEdges", () => {
  it("writes an edge that two triangles share once", () => {
    const { indices, ranges } = uniqueEdges(SQUARE, CORNERS, [{ startIndex: 0, indexCount: 6 }]);

    expect(segments(indices)).toEqual(["0-1", "0-2", "0-3", "1-2", "2-3"]);
    expect(ranges.get(0)).toEqual({ start: 0, count: 10 });
  });

  it("keeps the edges of each run apart, so either run draws alone", () => {
    const { indices, ranges } = uniqueEdges(SQUARE, CORNERS, [
      { startIndex: 0, indexCount: 3 },
      { startIndex: 3, indexCount: 3 },
    ]);

    expect(ranges.get(0)).toEqual({ start: 0, count: 6 });
    expect(ranges.get(3)).toEqual({ start: 6, count: 6 });
    expect(indices).toHaveLength(12);
  });

  it("skips a degenerate triangle's collapsed edge and measures the mean length", () => {
    const { indices, spacing } = uniqueEdges(
      [0, 0, 1],
      [0, 0, 0, 3, 4, 0],
      [{ startIndex: 0, indexCount: 3 }],
    );

    expect(segments(indices)).toEqual(["0-1"]);
    expect(spacing).toBe(5);
  });

  it("counts every edge of a large grid once", () => {
    const side = 200;
    const triangles: number[] = [];
    for (let y = 0; y < side; y += 1) {
      for (let x = 0; x < side; x += 1) {
        const at = y * (side + 1) + x;
        triangles.push(at, at + 1, at + side + 1, at + 1, at + side + 2, at + side + 1);
      }
    }

    const { indices } = uniqueEdges(
      triangles,
      [],
      [{ startIndex: 0, indexCount: triangles.length }],
    );

    /* The rows, the columns and one diagonal per cell. */
    expect(indices.length / 2).toBe(2 * side * (side + 1) + side * side);
  });
});

describe("createEdgeGeometry", () => {
  function source(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(CORNERS), 3));
    return geometry;
  }
  const edges = uniqueEdges(SQUARE, CORNERS, [{ startIndex: 0, indexCount: 6 }]);

  it("shares the source's attribute", () => {
    const from = source();

    expect(createEdgeGeometry(from, edges, ["position", "normal"]).attributes).toEqual({
      position: from.getAttribute("position"),
    });
  });

  it("names no shared attribute to a dispose and keeps them for a later draw", () => {
    const geometry = createEdgeGeometry(source(), edges, ["position"]);
    const named = vi.fn((event: { target: BufferGeometry }) =>
      Object.keys(event.target.attributes),
    );
    geometry.addEventListener("dispose", named);

    geometry.dispose();

    expect(named.mock.results[0]?.value).toEqual([]);
    expect(Object.keys(geometry.attributes)).toEqual(["position"]);
  });
});

describe("writeEdgeGroups", () => {
  it("follows the order of the groups and skips a group with no edges", () => {
    const target = new BufferGeometry();
    const ranges = new Map([
      [0, { start: 0, count: 6 }],
      [3, { start: 6, count: 6 }],
    ]);

    writeEdgeGroups(
      target,
      [
        { start: 3, count: 3, materialIndex: 1 },
        { start: 9, count: 3, materialIndex: 2 },
        { start: 0, count: 3, materialIndex: 0 },
      ],
      ranges,
    );

    expect(target.groups).toEqual([
      { start: 6, count: 6, materialIndex: 1 },
      { start: 0, count: 6, materialIndex: 0 },
    ]);
  });
});
