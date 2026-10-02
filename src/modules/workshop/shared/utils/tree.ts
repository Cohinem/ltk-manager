/** A row of a flattened tree: its node, and how deep the node sits. */
export interface TreeRow<Node> {
  readonly node: Node;
  readonly depth: number;
}

/**
 * Walk a tree into the rows to render, for the virtualizer.
 *
 * `openChildren` answers a node's children where it is an open branch, and null for a leaf or a
 * shut branch.
 */
export function treeRows<Node>(
  nodes: readonly Node[],
  openChildren: (node: Node) => readonly Node[] | null,
): TreeRow<Node>[] {
  const out: TreeRow<Node>[] = [];
  const walk = (list: readonly Node[], depth: number): void => {
    for (const node of list) {
      out.push({ node, depth });

      const children = openChildren(node);
      if (children !== null) walk(children, depth + 1);
    }
  };

  walk(nodes, 0);
  return out;
}

/**
 * The id of every branch in a tree at any depth, a branch before the branches under it.
 *
 * `branchOf` answers a branch's id and children, and null for a leaf.
 */
export function branchIdsOf<Node>(
  nodes: readonly Node[],
  branchOf: (node: Node) => { readonly id: string; readonly children: readonly Node[] } | null,
): string[] {
  const out: string[] = [];
  const walk = (list: readonly Node[]): void => {
    for (const node of list) {
      const branch = branchOf(node);
      if (branch === null) continue;

      out.push(branch.id);
      walk(branch.children);
    }
  };

  walk(nodes);
  return out;
}

/** The index of the tree row under `target`, or null off every row. */
export function treeItemIndexOf(target: EventTarget): number | null {
  if (!(target instanceof Element)) return null;

  const row = target.closest<HTMLElement>("[data-treeitem-index]");
  const index = Number(row?.dataset.treeitemIndex);
  return Number.isInteger(index) ? index : null;
}
