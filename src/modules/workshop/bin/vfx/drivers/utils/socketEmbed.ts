import type { DriverItem, GraphItem, GraphTree, StructItem, ValueItem } from "./graphItems";

/** The most items a list embeds with, past which it keeps a node of its own. */
const EMBEDDED_LIST = 8;

/**
 * A keyed or randomised value, or a driver whose whole body is one value line: a constant, or
 * a curve with no keys. A driver the registry cannot read keeps its node, so its warning stays
 * in view.
 */
export function embeds(item: DriverItem | ValueItem): boolean {
  if (item.type === "value") return true;
  if (item.ports.length > 0) return false;
  if (item.diagnostics.some((each) => each.level === "unsupported")) return false;

  const { node } = item;
  if (node.type === "constant") return true;
  return node.type === "curve" && node.curve.keys.length === 0 && node.curve.tables.length === 0;
}

/**
 * A short list of a struct's field whose items are leaves or keyed values, each of which is
 * embedded in it, so the whole list reads as rows under its socket.
 */
export function embedsList(item: StructItem): boolean {
  return (
    item.shape === "list" &&
    item.field !== null &&
    item.rows.length <= EMBEDDED_LIST &&
    item.rows.every((row) => row.entries === null && (row.input?.type ?? "value") === "value") &&
    item.ports.every((port) => port.embed !== undefined)
  );
}

/**
 * The tree with each item that `embeds` moved into the socket it feeds, unless the reader
 * `popped` it out to a node. An embedded item is on its socket's port and off the tree, so
 * the layout places no node and draws no edge for it.
 */
export function embedSockets(tree: GraphTree, popped: ReadonlySet<string>): GraphTree {
  const embedded = new Map<string, DriverItem | ValueItem | StructItem>();
  const kept: GraphTree["inputs"][number][] = [];
  let changed = false;

  for (const input of tree.inputs) {
    const { item } = input.tree;
    if ((item.type === "driver" || item.type === "value") && embeds(item) && !popped.has(item.id)) {
      embedded.set(input.port, item);
      changed = true;
      continue;
    }

    const shown = embedSockets(input.tree, popped);
    if (shown.item.type === "struct" && embedsList(shown.item) && !popped.has(shown.item.id)) {
      embedded.set(input.port, shown.item);
      changed = true;
      continue;
    }

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

/** The lists of `item` embedded in its sockets, by the id of the port each sits in. */
export function embeddedLists(item: GraphItem): ReadonlyMap<string, StructItem> {
  return new Map(
    item.ports.flatMap((port) => (port.embed?.type === "struct" ? [[port.id, port.embed]] : [])),
  );
}

/** The ids of the ports of `item` a keyed value is embedded in. */
export function embeddedValues(item: GraphItem): ReadonlySet<string> {
  return new Set(item.ports.filter((port) => port.embed?.type === "value").map((port) => port.id));
}
