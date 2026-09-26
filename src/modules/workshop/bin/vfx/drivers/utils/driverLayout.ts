import type { DriverKind, DriverNode } from "../../engine/drivers/node";
import type { GraphItem, GraphTree } from "./systemGraph";

/** An item placed on the canvas: its top-left corner and its size, in canvas units. */
export interface PlacedItem {
  readonly item: GraphItem;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** An edge from an item's output to one port of the item it feeds. */
export interface LayoutEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  /** The port of `target`. */
  readonly port: string;
  readonly kind: DriverKind | null;
}

export interface GraphLayout {
  readonly items: readonly PlacedItem[];
  readonly edges: readonly LayoutEdge[];
}

/** The width of every node but the preview. The column spacing is based on it. */
export const NODE_WIDTH = 264;

/** The viewport inside the preview node. */
export const PREVIEW_VIEWPORT = { width: 520, height: 340 } as const;

/** The width of the port column beside the preview's viewport. */
export const PREVIEW_PORTS_WIDTH = 176;

/** The node header, each port row and each body line, as the node components draw them. */
export const HEADER_HEIGHT = 48;
export const LINE_HEIGHT = 26;
export const BODY_PADDING = 10;

/** The number of fields a node of an unknown class lists before it counts the rest. */
export const UNKNOWN_FIELD_LINES = 8;

const COLUMN_GAP = 96;
const ROW_GAP = 20;

const NONE_COLLAPSED: ReadonlySet<string> = new Set();

/**
 * A graph tree as placed canvas items and edges, with each input left of the item it feeds.
 *
 * The root is the rightmost item. A leaf takes the next free row of its column, and an
 * item is placed level with the middle of its inputs. The same tree gets the same layout
 * on every read. Decision 2.8 of docs/plans/shimmer-driver-graph.md.
 */
export function layoutGraph(
  root: GraphTree,
  collapsed: ReadonlySet<string> = NONE_COLLAPSED,
): GraphLayout {
  const items: PlacedItem[] = [];
  const edges: LayoutEdge[] = [];
  let nextTop = 0;

  /** Place `tree` with its right edge at `right`. Returns the item's vertical middle. */
  function place(tree: GraphTree, right: number): number {
    const { width, height } = sizeOf(tree.item);
    const x = right - width;
    const inputs = collapsed.has(tree.item.id) ? [] : tree.inputs;

    let middle: number;
    if (inputs.length === 0) {
      middle = nextTop + height / 2;
      nextTop += height + ROW_GAP;
    } else {
      const middles = inputs.map((input) => place(input.tree, x - COLUMN_GAP));
      middle = (middles[0]! + middles.at(-1)!) / 2;
    }

    items.push({ item: tree.item, x, y: middle - height / 2, width, height });
    for (const input of inputs) {
      edges.push({
        id: `${input.tree.item.id}->${tree.item.id}`,
        source: input.tree.item.id,
        target: tree.item.id,
        port: input.port,
        kind: tree.item.ports.find((each) => each.id === input.port)?.kind ?? null,
      });
    }
    return middle;
  }

  place(root, 0);
  return { items, edges };
}

/** The size an item draws at. The node components size themselves from the same numbers. */
export function sizeOf(item: GraphItem): { width: number; height: number } {
  if (item.type === "preview") {
    const ports = HEADER_HEIGHT + item.ports.length * LINE_HEIGHT + BODY_PADDING;
    return {
      width: PREVIEW_PORTS_WIDTH + PREVIEW_VIEWPORT.width,
      height: Math.max(ports, HEADER_HEIGHT + PREVIEW_VIEWPORT.height + BODY_PADDING),
    };
  }

  const lines = item.type === "driver" ? bodyLines(item.node) : 0;
  const rows = Math.max(item.ports.length + lines, 1);
  return { width: NODE_WIDTH, height: HEADER_HEIGHT + rows * LINE_HEIGHT + BODY_PADDING };
}

/** The number of lines a driver node's body draws. */
export function bodyLines(node: DriverNode): number {
  switch (node.type) {
    case "constant":
    case "curve":
    case "empty":
      return 1;
    case "unknown":
      if (node.value.type !== "struct") return 1;
      return Math.max(1, Math.min(node.value.fields.length, UNKNOWN_FIELD_LINES + 1));
    case "operator":
      return node.stored.length;
    case "property":
      return 0;
  }
}
