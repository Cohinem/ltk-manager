import type { LayoutEdge } from "./driverLayout";

/** The share of the gap between two nodes that the lanes of a step edge's turn spread over. */
const LANES = { first: 0.15, last: 0.85 } as const;

/** Where an edge leaves its source and lands on its port, on the canvas's vertical axis. */
export interface EdgeEnds {
  readonly from: number;
  readonly to: number;
}

/**
 * Where each edge turns, as a share of the gap between its two ends.
 *
 * The edges into one node share a gap, so each takes a lane of its own rather than one
 * vertical they all draw over. An edge falling to a lower port turns nearer its source than
 * one falling to a higher port, and a rising edge the other way round, so neither crosses a
 * neighbour's run. An edge `ends` cannot place turns halfway.
 */
export function edgeLanes(
  edges: readonly LayoutEdge[],
  ends: (edge: LayoutEdge) => EdgeEnds | null,
): Map<string, number> {
  const byTarget = new Map<string, { id: string; ends: EdgeEnds }[]>();
  for (const edge of edges) {
    const placed = ends(edge);
    if (placed === null) continue;
    const into = byTarget.get(edge.target);
    if (into === undefined) byTarget.set(edge.target, [{ id: edge.id, ends: placed }]);
    else into.push({ id: edge.id, ends: placed });
  }

  const lanes = new Map<string, number>();
  for (const into of byTarget.values()) {
    const byPort = (left: { ends: EdgeEnds }, right: { ends: EdgeEnds }) =>
      left.ends.to - right.ends.to;
    const falling = into.filter((each) => each.ends.from < each.ends.to).sort(byPort);
    const rising = into.filter((each) => each.ends.from >= each.ends.to).sort(byPort);

    falling.forEach((each, index) => {
      lanes.set(each.id, lane(falling.length - 1 - index, falling.length));
    });
    rising.forEach((each, index) => lanes.set(each.id, lane(index, rising.length)));
  }
  return lanes;
}

/** Two lane maps that turn every edge at the same place. */
export function sameLanes(left: ReadonlyMap<string, number>, right: ReadonlyMap<string, number>) {
  if (left.size !== right.size) return false;
  for (const [id, at] of left) {
    if (right.get(id) !== at) return false;
  }
  return true;
}

function lane(index: number, count: number): number {
  if (count <= 1) return (LANES.first + LANES.last) / 2;
  return LANES.first + ((LANES.last - LANES.first) * index) / (count - 1);
}
