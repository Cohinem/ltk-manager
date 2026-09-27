import type { DriverItem, GraphItem, GraphTree } from "./graphItems";

/**
 * A driver whose whole body is one value line: a constant, or a curve with no keys. A driver
 * the registry cannot read keeps its node, so its warning stays in view.
 */
export function embeds(item: DriverItem): boolean {
  if (item.ports.length > 0) return false;
  if (item.diagnostics.some((each) => each.level === "unsupported")) return false;

  const { node } = item;
  if (node.type === "constant") return true;
  return node.type === "curve" && node.curve.keys.length === 0 && node.curve.tables.length === 0;
}

/**
 * The tree with each driver that `embeds` moved into the socket it feeds, unless the reader
 * `popped` it out to a node. An embedded driver is on its socket's port and off the tree, so
 * the layout places no node and draws no edge for it.
 */
export function embedSockets(tree: GraphTree, popped: ReadonlySet<string>): GraphTree {
  const embedded = new Map<string, DriverItem>();
  const kept: GraphTree["inputs"][number][] = [];
  let changed = false;

  for (const input of tree.inputs) {
    const { item } = input.tree;
    if (item.type === "driver" && embeds(item) && !popped.has(item.id)) {
      embedded.set(input.port, item);
      changed = true;
      continue;
    }

    const shown = embedSockets(input.tree, popped);
    changed ||= shown !== input.tree;
    kept.push(shown === input.tree ? input : { ...input, tree: shown });
  }
  if (!changed) return tree;

  const ports = tree.item.ports.map((port) => {
    const embed = embedded.get(port.id);
    return embed === undefined ? port : { ...port, embed };
  });
  return { item: { ...tree.item, ports } as GraphItem, inputs: kept };
}
