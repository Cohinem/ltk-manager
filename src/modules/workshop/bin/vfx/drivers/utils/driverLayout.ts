import type { DriverKind, DriverNode } from "../../engine/drivers/node";
import { stripShape } from "./curveShape";
import type { GraphItem, GraphTree, MasterItem, StructItem, ValueItem } from "./graphItems";
import { itemSubtitle, itemTitle } from "./nodeText";

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

/** The viewport inside the preview node. */
export const PREVIEW_VIEWPORT = { width: 630, height: 428 } as const;

/** The width of the port column beside the preview's viewport. */
export const PREVIEW_PORTS_WIDTH = 176;

/** The node header, each port row and each body line, as the node components draw them. */
export const HEADER_HEIGHT = 48;
export const LINE_HEIGHT = 26;
export const BODY_PADDING = 10;

/** A master node's live preview: a square, as wide as a folded node inside its 8px margins. */
export const EMITTER_PREVIEW_SIZE = 300;

/** The preview's line of a master node, with the preview's 4px margin above and below. */
export const EMITTER_PREVIEW_HEIGHT = EMITTER_PREVIEW_SIZE + 8;

/** A file node's or a spawn shape's preview square, and its line with 4px above and below. */
export const NODE_PREVIEW_SIZE = 200;
const NODE_PREVIEW_HEIGHT = NODE_PREVIEW_SIZE + 8;

/** A file node: its preview square with room for the path under it. */
const FILE_NODE_WIDTH = 280;

/** A struct node's own struct and every struct folded into it as a section, outermost first. */
export function sectionsOf(item: StructItem): StructItem[] {
  return item.nested === null ? [item] : [item, ...sectionsOf(item.nested)];
}

function classLength(item: StructItem): number {
  return (item.className ?? item.classHash ?? "").length;
}

/** A struct node that draws its spawn shape in 3D over its rows: a `VfxShape*` struct. */
export function shapePreviewed(item: StructItem): boolean {
  return item.shape === "struct" && (item.className?.startsWith("VfxShape") ?? false);
}

/** The frame's 2px top edge and 1px bottom edge, which a node's height includes. */
const FRAME_EDGES = 3;

/** The lines a value node's curve strip is tall, which its summary sits in the corner of. */
export const STRIP_LINES = 3;

/** The number of fields a node of an unknown class lists before it counts the rest. */
export const UNKNOWN_FIELD_LINES = 8;

/** The narrowest and the widest a column of nodes draws. */
const MIN_NODE_WIDTH = 232;
const MAX_NODE_WIDTH = 440;

/*
 * Advance widths for the width estimate: Geist Mono at 0.6em of the 12px row and 11px meta
 * type, and an average for Geist at the title's weight. An estimate short of the text
 * truncates it and leaves the node whole.
 */
const MONO_ADVANCE = 7.2;
const META_MONO_ADVANCE = 6.6;
const SANS_ADVANCE = 6.9;

/** A header's padding, collapse caret, glyph and reveal button, and one chip beside a title. */
const HEADER_CHROME = 104;
const CHIP_WIDTH = 72;

/** A port row's padding and kind label, and a driver subtitle's kind label. */
const PORT_CHROME = 64;
const KIND_LABEL_WIDTH = 36;

/** The field a value of 1 to 4 components edits in, the label beside a stored one, and padding. */
const VALUE_WIDTH = [0, 120, 170, 230, 290] as const;
const VALUE_LABEL_WIDTH = 64;
const BODY_CHROME = 16;

/** The width of a node whose rows are the inspector's field rows: a name column and a value. */
const FIELD_NODE_WIDTH = { master: 456, value: 320 } as const;

/** A struct node's name column, from the inspector's 9rem up, and its value column. */
const STRUCT_NAME_WIDTH = { min: 144, max: 248 } as const;
const STRUCT_VALUE_WIDTH = { min: 200, max: 300 } as const;

/** A name's gutter and padding, and a class picker's caret and padding. */
const NAME_CHROME = 32;
const CLASS_CHROME = 40;

/** The label of a struct node's class line, which its name column holds too. */
const CLASS_LABEL = "Class";

/** A folded master node: its preview inside the 8px side margins. */
const FOLDED_MASTER_WIDTH = EMITTER_PREVIEW_SIZE + 16;

/** An easing body's function name beside its time. */
const EASING_LINE_WIDTH = 200;

const COLUMN_GAP = 128;
const ROW_GAP = 20;

/** The space between two emitters' blocks, and between the blocks and the preview. */
const BLOCK_GAP = 160;

/** The shape the blocks are packed toward, width over height, about a pane's own. */
const PACKED_ASPECT = 16 / 10;

const NONE_COLLAPSED: ReadonlySet<string> = new Set();

/**
 * A graph tree as placed canvas items and edges, with each input left of the item it feeds.
 *
 * Under the preview, each emitter's tree is a block of its own, and the blocks pack onto a
 * board toward `PACKED_ASPECT`, so a large system reads as a board rather than one tall
 * column. The preview stands right of the board's top. The same tree gets the same layout
 * on every read. Decision 2.8 of docs/plans/shimmer-driver-graph.md.
 */
export function layoutGraph(
  root: GraphTree,
  collapsed: ReadonlySet<string> = NONE_COLLAPSED,
): GraphLayout {
  if (root.item.type !== "preview") return layoutTree(root, collapsed);

  const blocks = root.inputs.map((input) => layoutTree(input.tree, collapsed));
  const placed = packBlocks(blocks);
  const packedWidth = Math.max(0, ...placed.map(({ x, block }) => x + blockWidth(block)));
  const { width, height } = sizeOf(root.item);
  const preview: PlacedItem = {
    item: root.item,
    x: placed.length === 0 ? 0 : packedWidth + BLOCK_GAP,
    y: 0,
    width,
    height,
  };

  return {
    items: [
      ...placed.flatMap(({ x, y, block }) =>
        block.items.map((each) => ({ ...each, x: each.x + x, y: each.y + y })),
      ),
      preview,
    ],
    edges: [
      ...blocks.flatMap((block) => block.edges),
      ...root.inputs.map((input) => edgeOf(root, input)),
    ],
  };
}

/** One stretch of the skyline: the top of whatever is placed across `[x, x + width)`. */
interface Ledge {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

/**
 * Where each of `blocks` goes on a board about `PACKED_ASPECT` in shape.
 *
 * Each block in turn takes the lowest spot across the board's width, leftmost on a tie, so a
 * short block fills the space beside a tall one rather than waiting for its row to end.
 */
function packBlocks(
  blocks: readonly GraphLayout[],
): { x: number; y: number; block: GraphLayout }[] {
  const sizes = blocks.map((block) => ({
    width: blockWidth(block) + BLOCK_GAP,
    height: blockHeight(block) + BLOCK_GAP,
  }));
  const area = sizes.reduce((sum, size) => sum + size.width * size.height, 0);
  const boardWidth = Math.max(Math.sqrt(area * PACKED_ASPECT), ...sizes.map((size) => size.width));

  let skyline: Ledge[] = [{ x: 0, y: 0, width: boardWidth }];
  return blocks.map((block, index) => {
    const { width, height } = sizes[index]!;
    let best: { x: number; y: number } | null = null;
    for (const ledge of skyline) {
      if (ledge.x + width > boardWidth) continue;

      const under = skyline.filter(
        (each) => each.x < ledge.x + width && each.x + each.width > ledge.x,
      );
      const y = Math.max(...under.map((each) => each.y));
      if (best === null || y < best.y) best = { x: ledge.x, y };
    }

    const at = best ?? { x: 0, y: Math.max(...skyline.map((each) => each.y)) };
    skyline = raised(skyline, { x: at.x, y: at.y + height, width });
    return { ...at, block };
  });
}

/** `skyline` with `top` laid over the ledges it covers. */
function raised(skyline: readonly Ledge[], top: Ledge): Ledge[] {
  const end = top.x + top.width;
  const out: Ledge[] = [top];
  for (const ledge of skyline) {
    const ledgeEnd = ledge.x + ledge.width;
    if (ledgeEnd <= top.x || ledge.x >= end) {
      out.push(ledge);
      continue;
    }

    if (ledge.x < top.x) out.push({ ...ledge, width: top.x - ledge.x });
    if (ledgeEnd > end) out.push({ x: end, y: ledge.y, width: ledgeEnd - end });
  }
  return out.sort((left, right) => left.x - right.x);
}

/* A block from `layoutTree` has its top-left corner at the origin. */
function blockWidth(block: GraphLayout): number {
  return Math.max(0, ...block.items.map((each) => each.x + each.width));
}

function blockHeight(block: GraphLayout): number {
  return Math.max(0, ...block.items.map((each) => each.y + each.height));
}

/**
 * One tree placed with its root rightmost and its top-left corner at the origin.
 *
 * Each depth is one column, as wide as its widest item. A leaf takes the next free row of
 * its column, and an item is placed level with the middle of its inputs.
 */
function layoutTree(root: GraphTree, collapsed: ReadonlySet<string>): GraphLayout {
  const items: PlacedItem[] = [];
  const edges: LayoutEdge[] = [];
  const inputsOf = (tree: GraphTree) => (collapsed.has(tree.item.id) ? [] : tree.inputs);

  const widths: number[] = [];
  const measure = (tree: GraphTree, depth: number) => {
    widths[depth] = Math.max(
      widths[depth] ?? 0,
      sizeOf(tree.item, collapsed.has(tree.item.id)).width,
    );
    inputsOf(tree).forEach((input) => measure(input.tree, depth + 1));
  };
  measure(root, 0);

  const total = widths.reduce((sum, width) => sum + width, 0) + COLUMN_GAP * (widths.length - 1);
  const rights = [total];
  widths.forEach((width, depth) => rights.push(rights[depth]! - width - COLUMN_GAP));

  let nextTop = 0;

  /** Place `tree` in the column at `depth`. Returns the item's vertical middle. */
  function place(tree: GraphTree, depth: number): number {
    const width = widths[depth]!;
    const { height } = sizeOf(tree.item, collapsed.has(tree.item.id));
    const inputs = inputsOf(tree);

    let middle: number;
    if (inputs.length === 0) {
      middle = nextTop + height / 2;
      nextTop += height + ROW_GAP;
    } else {
      const middles = inputs.map((input) => place(input.tree, depth + 1));
      middle = (middles[0]! + middles.at(-1)!) / 2;
    }

    const x = rights[depth]! - width;
    items.push({ item: tree.item, x, y: middle - height / 2, width, height });
    for (const input of inputs) edges.push(edgeOf(tree, input));
    return middle;
  }

  place(root, 0);

  const top = Math.min(0, ...items.map((each) => each.y));
  return { items: items.map((each) => ({ ...each, y: each.y - top })), edges };
}

/** The edge from `input`'s root to the port it feeds on `tree`'s root. */
function edgeOf(tree: GraphTree, input: GraphTree["inputs"][number]): LayoutEdge {
  return {
    id: `${input.tree.item.id}->${tree.item.id}`,
    source: input.tree.item.id,
    target: tree.item.id,
    port: input.port,
    kind: tree.item.ports.find((each) => each.id === input.port)?.kind ?? null,
  };
}

/**
 * The size an item draws at, its width estimated from its text.
 *
 * The node components size themselves from the same numbers. An item with no ports and no
 * body draws its header alone.
 */
function fieldNodeWidth(item: MasterItem | StructItem | ValueItem, folded: boolean): number {
  if (item.type === "master") return folded ? FOLDED_MASTER_WIDTH : FIELD_NODE_WIDTH.master;
  if (item.type === "value") return FIELD_NODE_WIDTH.value;

  const className = Math.max(...sectionsOf(item).map(classLength)) * MONO_ADVANCE + CLASS_CHROME;
  const value = Math.min(STRUCT_VALUE_WIDTH.max, Math.max(STRUCT_VALUE_WIDTH.min, className));
  return Math.ceil(structNameWidth(item) + value + BODY_CHROME);
}

/**
 * A struct node's name column: as wide as its longest row name, and no narrower than the
 * inspector's own column.
 */
export function structNameWidth(item: StructItem): number {
  const names = sectionsOf(item).flatMap((section) => section.rows.map((row) => row.name.length));
  const longest = Math.max(CLASS_LABEL.length, ...names);
  const natural = Math.ceil(longest * MONO_ADVANCE) + NAME_CHROME;
  return Math.min(STRUCT_NAME_WIDTH.max, Math.max(STRUCT_NAME_WIDTH.min, natural));
}

export function sizeOf(item: GraphItem, folded = false): { width: number; height: number } {
  if (item.type === "preview") {
    const ports = HEADER_HEIGHT + item.ports.length * LINE_HEIGHT + BODY_PADDING;
    return {
      width: PREVIEW_PORTS_WIDTH + PREVIEW_VIEWPORT.width,
      height: Math.max(ports, HEADER_HEIGHT + PREVIEW_VIEWPORT.height + BODY_PADDING),
    };
  }

  if (item.type === "file") {
    return {
      width: FILE_NODE_WIDTH,
      height: HEADER_HEIGHT + FRAME_EDGES + NODE_PREVIEW_HEIGHT + LINE_HEIGHT + BODY_PADDING,
    };
  }

  if (item.type === "master" || item.type === "struct" || item.type === "value") {
    const preview =
      (item.type === "master" ? EMITTER_PREVIEW_HEIGHT : 0) +
      (item.type === "struct" && (shapePreviewed(item) || item.picture !== null)
        ? NODE_PREVIEW_HEIGHT
        : 0);
    return {
      width: fieldNodeWidth(item, folded),
      height:
        HEADER_HEIGHT +
        FRAME_EDGES +
        preview +
        (folded && item.type === "master" ? 0 : fieldLines(item) * LINE_HEIGHT + BODY_PADDING),
    };
  }

  const rows = item.ports.length + (item.type === "driver" ? bodyLines(item.node) : 0);
  const body = rows === 0 ? 0 : rows * LINE_HEIGHT + BODY_PADDING;
  return { width: naturalWidth(item), height: HEADER_HEIGHT + FRAME_EDGES + body };
}

function naturalWidth(item: GraphItem): number {
  const title = itemTitle(item).length * SANS_ADVANCE + chipCount(item) * CHIP_WIDTH;
  const kind = item.type === "driver" ? KIND_LABEL_WIDTH : 0;
  const subtitle = itemSubtitle(item).length * META_MONO_ADVANCE + kind;
  const header = HEADER_CHROME + Math.max(title, subtitle);
  const ports = item.ports.map((port) => PORT_CHROME + port.label.length * MONO_ADVANCE);
  const body = item.type === "driver" ? bodyWidth(item.node) : 0;

  const natural = Math.max(header, body, ...ports);
  return Math.ceil(Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, natural)));
}

/** The chips a header draws beside its title: disabled, or a trust level. */
function chipCount(item: GraphItem): number {
  if (item.type === "emitter") return item.disabled ? 1 : 0;
  if (item.type !== "driver") return 0;
  return item.diagnostics.length > 0 || item.node.type === "unknown" ? 1 : 0;
}

function bodyWidth(node: DriverNode): number {
  switch (node.type) {
    case "constant":
      return BODY_CHROME + valueWidth(node.value);
    case "curve":
      if (node.curve.keys.length > 0) return 0;
      return BODY_CHROME + valueWidth(node.curve.constant);
    case "operator":
      return widest(node.stored.map((each) => VALUE_LABEL_WIDTH + valueWidth(each.value)));
    case "random":
      return BODY_CHROME + VALUE_LABEL_WIDTH + valueWidth(node.range);
    case "easing":
      return BODY_CHROME + EASING_LINE_WIDTH;
    case "unknown": {
      if (node.value.type !== "struct") return 0;
      const shown = node.value.fields.slice(0, UNKNOWN_FIELD_LINES);
      return widest(
        shown.map(
          (field) => 2 * KIND_LABEL_WIDTH + (field.name ?? field.hash).length * MONO_ADVANCE,
        ),
      );
    }
    case "property":
    case "empty":
      return 0;
  }
}

/** The widest of a body's lines, with the body's padding. Zero for a body of no lines. */
function widest(lines: readonly number[]): number {
  return lines.length === 0 ? 0 : BODY_CHROME + Math.max(...lines);
}

function valueWidth(value: readonly number[]): number {
  return VALUE_WIDTH[Math.min(value.length, 4)] ?? 0;
}

/**
 * The lines a master, struct or curve node draws, each one `LINE_HEIGHT` tall.
 *
 * A master draws each group's heading, fields and Add field line, then the Add field line of
 * the groups it has none of. A struct node draws its class line over its rows, and a curve
 * node its value over its summary.
 */
export function fieldLines(item: MasterItem | StructItem | ValueItem): number {
  switch (item.type) {
    case "master":
      return item.groups.reduce((sum, each) => sum + each.fields.length + 2, 1);
    case "struct":
      return (
        item.rows.length +
        (item.shape === "struct" ? 1 : 0) +
        (item.nested === null ? 0 : 1 + fieldLines(item.nested))
      );
    case "value":
      return stripShape(item) === null ? 2 : 1 + STRIP_LINES;
  }
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
    case "random":
      return 1;
    case "easing":
      return 2;
    case "property":
      return 0;
  }
}
