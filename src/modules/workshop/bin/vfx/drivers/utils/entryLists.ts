import type {
  GraphItem,
  GraphTree,
  InputItem,
  RenderItem,
  StructItem,
  StructRow,
} from "./graphItems";
import { listAppend } from "./nodeEdits";
import { drawnInSection } from "./renderSection";

/** The id a list a material holds folds under: its node's and its row's. */
export function listId(item: StructItem, row: StructRow): string {
  return `${item.id}:${row.key}`;
}

/** Every list a material holds in `tree`, its folded sections' included, which open folded. */
export function listIds(tree: GraphTree): Set<string> {
  const out = new Set<string>();
  const visit = (node: GraphTree) => {
    if (node.item.type === "struct") collect(node.item, out);
    node.inputs.forEach((input) => visit(input.tree));
  };
  visit(tree);
  return out;
}

function collect(item: StructItem, out: Set<string>): void {
  item.rows.forEach((row) => {
    if (row.entries !== null) out.add(listId(item, row));
  });
  if (item.nested !== null) collect(item.nested, out);
}

/** `tree` with each material list marked open unless `collapsed` holds its id. */
export function openLists(tree: GraphTree, collapsed: ReadonlySet<string>): GraphTree {
  const item = tree.item.type === "struct" ? marked(tree.item, collapsed) : tree.item;
  return {
    item,
    inputs: tree.inputs.map((input) => ({ ...input, tree: openLists(input.tree, collapsed) })),
  };
}

function marked(item: StructItem, collapsed: ReadonlySet<string>): StructItem {
  if (!item.rows.some((row) => row.entries !== null) && item.nested === null) return item;

  return {
    ...item,
    rows: item.rows.map((row) =>
      row.entries === null ? row : { ...row, listOpen: !collapsed.has(listId(item, row)) },
    ),
    nested: item.nested === null ? null : marked(item.nested, collapsed),
  };
}

/** The lines a struct row draws: its own, and its entries under it while its list is open. */
function rowLines(row: StructRow): number {
  return 1 + (row.listOpen === true ? (row.entries?.length ?? 0) : 0);
}

/** The list embedded in `owner`'s socket that `input` feeds, if one is. */
export function socketList(owner: GraphItem, input: InputItem | null): StructItem | undefined {
  if (input === null) return undefined;
  const embed = owner.ports.find((port) => port.id === input.id)?.embed;
  return embed?.type === "struct" ? embed : undefined;
}

/** The lines a list embedded in a socket draws under it: a line per item and its Add item line. */
export function socketLines(owner: GraphItem, input: InputItem | null): number {
  const list = socketList(owner, input);
  return list === undefined ? 0 : list.rows.length + 1;
}

/**
 * The lines a struct node draws: its rows, a list field's Add item line under them, and a
 * folded section's heading and lines. `owner` holds the sockets a list is embedded in, which a
 * section shares with its node.
 */
export function structLines(item: StructItem, owner: GraphItem = item): number {
  return (
    item.rows.reduce((sum, row) => sum + rowLines(row) + socketLines(owner, row.input), 0) +
    (listAppend(item) === null ? 0 : 1) +
    (item.nested === null ? 0 : 1 + structLines(item.nested, owner))
  );
}

/** The lines a Texture node draws: a line per field, and an effect's heading and struct lines. */
export function renderLines(item: RenderItem): number {
  return item.fields.reduce((sum, field) => {
    const folded = field.input?.type === "struct" && drawnInSection(field.hash, field.input);
    return (
      sum + (folded && field.input?.type === "struct" ? 1 + structLines(field.input, item) : 1)
    );
  }, 0);
}
