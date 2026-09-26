import type { LayoutEdge } from "./driverLayout";

/** The items and edges on every path through a set of items. */
export interface GraphChain {
  readonly items: ReadonlySet<string>;
  readonly edges: ReadonlySet<string>;
}

/** Which way a walk follows edges: toward the inputs, or toward what an item feeds. */
export type ChainDirection = "inputs" | "outputs";

/** Everything that feeds `focus` and everything `focus` feeds, with the edges between them. */
export function chainThrough(focus: Iterable<string>, edges: readonly LayoutEdge[]): GraphChain {
  const inputs = reach(focus, edges, "inputs");
  const outputs = reach(focus, edges, "outputs");
  const lit = edges.filter(
    (edge) =>
      (inputs.has(edge.source) && inputs.has(edge.target)) ||
      (outputs.has(edge.source) && outputs.has(edge.target)),
  );

  return { items: new Set([...inputs, ...outputs]), edges: new Set(lit.map((edge) => edge.id)) };
}

/** The items `from` reaches along `edges` in `direction`, `from` included. */
export function reach(
  from: Iterable<string>,
  edges: readonly LayoutEdge[],
  direction: ChainDirection,
): Set<string> {
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    const [near, far] =
      direction === "inputs" ? [edge.target, edge.source] : [edge.source, edge.target];
    next.set(near, [...(next.get(near) ?? []), far]);
  }

  const seen = new Set(from);
  const queue = [...seen];
  while (queue.length > 0) {
    for (const far of next.get(queue.pop()!) ?? []) {
      if (seen.has(far)) continue;

      seen.add(far);
      queue.push(far);
    }
  }
  return seen;
}
