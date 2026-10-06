import type { DriverKind, DriverNode } from "../../engine/drivers/node";
import { PRIMITIVE_FIELD } from "../../inspector/utils/primitives";
import { valueLines } from "./curveShape";
import { renderLines, socketLines, structLines } from "./entryLists";
import type {
  GraphItem,
  GraphTree,
  MasterField,
  MasterItem,
  RenderItem,
  StructItem,
  ValueItem,
} from "./graphItems";
import { MATERIAL_CLASSES } from "./materialNodes";
import {
  fieldNameWidth,
  naturalWidth,
  structNameWidth,
  structWidth,
  UNKNOWN_FIELD_LINES,
} from "./nodeWidth";
import { BLOCK_GAP, FRAME_HEADER_HEIGHT, FRAME_PADDING, frameSize, packBlocks } from "./packBlocks";
import { componentOf, renderTexture } from "./renderSection";
import { estimateText, type MeasureText } from "./textWidth";

/** An item placed on the canvas: its top-left corner and its size, in canvas units. */
export interface PlacedItem {
  readonly item: GraphItem;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** The id of the frame the item sits in, where it sits in one. */
  readonly frame?: string;
  /** A master, render or struct node's name column in pixels, which its rows and its width share. */
  readonly nameWidth?: number;
}

/** One emitter's block drawn as a frame around it, named for the emitter at its root. */
export interface PlacedFrame {
  readonly id: string;
  readonly root: GraphItem;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** The number of items in the frame. */
  readonly count: number;
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
  /** The emitter frames, each listed before the items it holds would be drawn. */
  readonly frames: readonly PlacedFrame[];
}

/** The viewport inside the preview node. */
export const PREVIEW_VIEWPORT = { width: 630, height: 428 } as const;

/** The width of the port column beside the preview's viewport. */
export const PREVIEW_PORTS_WIDTH = 176;

/** The node header, each port row and each body line, as the node components draw them. */
export const HEADER_HEIGHT = 48;
export const LINE_HEIGHT = 30;
const BODY_PADDING = 10;

/**
 * How much wider than tall a node's preview is: an emitter's, which is what the node is for,
 * and the shorter one of a node that feeds an emitter.
 */
const PREVIEW_ASPECT = { emitter: 4 / 3, input: 2 } as const;

/** The node's 1px side edges and the preview's 8px side margins, which the preview's width leaves out. */
const PREVIEW_INSET = 18;

/** The height of the preview `item`'s node draws `width` wide, as wide as the node inside its margins. */
export function previewHeight(item: GraphItem, width: number): number {
  const aspect = item.type === "master" ? PREVIEW_ASPECT.emitter : PREVIEW_ASPECT.input;
  return Math.round((width - PREVIEW_INSET) / aspect);
}

/** A preview's line of a node, with the preview's 4px margin above and below. */
function previewLine(item: GraphItem, width: number): number {
  return previewHeight(item, width) + 8;
}

/** A primitive node's sketch, at the sketch's own 16:9, and its line with 4px above and below. */
export const PRIMITIVE_PREVIEW = { width: 176, height: 99 } as const;
const PRIMITIVE_PREVIEW_HEIGHT = PRIMITIVE_PREVIEW.height + 8;

/** A file node: wide enough for the path under its preview. */
const FILE_NODE_WIDTH = 280;

/** A struct node that draws its spawn shape in 3D over its rows: a `VfxShape*` struct. */
export function shapePreviewed(item: StructItem): boolean {
  return item.shape === "struct" && (item.className?.startsWith("VfxShape") ?? false);
}

/** A struct node that is an emitter's primitive, which draws the inspector's sketch of it. */
export function isPrimitive(item: StructItem): boolean {
  return item.shape === "struct" && item.field === PRIMITIVE_FIELD;
}

/** A struct node that is a material or holds one, which opens folded to its header. */
export function isMaterial(item: StructItem): boolean {
  return (
    MATERIAL_CLASSES.has(item.classHash ?? "") || MATERIAL_CLASSES.has(item.nested?.classHash ?? "")
  );
}

/**
 * A component node that draws a picture: a Geometry node's view of its emitter, or a Texture
 * node's texture where it has one.
 */
export function renderPreviewed(item: RenderItem): boolean {
  return item.role === "geometry" || renderTexture(item) !== null;
}

/** The line of the preview a struct node draws over its rows, and zero where it draws none. */
function structPreviewLine(item: StructItem, width: number): number {
  if (isPrimitive(item)) return PRIMITIVE_PREVIEW_HEIGHT;
  if (shapePreviewed(item) || isMaterial(item) || item.picture !== null)
    return previewLine(item, width);
  return 0;
}

/** The frame's 2px top edge and 1px bottom edge, which a node's height includes. */
const FRAME_EDGES = 3;

/** A value node's one-line header. */
export const VALUE_HEADER_HEIGHT = 30;

/** The space above and below the rows of a master, struct, value or file node. */
export const FIELD_PADDING = 4;

/** The width of a node whose rows are the inspector's field rows: a name column and a value. */
const FIELD_NODE_WIDTH = { value: 320, component: 400 } as const;

/** A master or render row beside its name column: a vector's components and its mode buttons. */
const MASTER_VALUE_WIDTH = 312;

/** A folded master node: its header's controls, over its preview. */
const FOLDED_MASTER_WIDTH = 316;

export { FRAME_HEADER_HEIGHT, FRAME_PADDING } from "./packBlocks";

const COLUMN_GAP = 128;
const ROW_GAP = 20;

const NONE_COLLAPSED: ReadonlySet<string> = new Set();

/**
 * A graph tree as placed canvas items and edges, with each input left of the item it feeds.
 *
 * Under the preview, each emitter's tree is a block of its own in a frame, and the frames
 * pack onto a board toward `PACKED_ASPECT`, so a large system reads as a board rather than
 * one tall column. The preview stands right of the board's top, and without `withPreview`
 * the board stands alone. The same tree gets the same layout on every read. Decision 2.8 of
 * docs/plans/shimmer-driver-graph.md.
 */
export function layoutGraph(
  root: GraphTree,
  collapsed: ReadonlySet<string> = NONE_COLLAPSED,
  withPreview = true,
  measure: MeasureText = estimateText,
): GraphLayout {
  if (root.item.type !== "preview") return layoutTree(root, collapsed, measure);

  const blocks = root.inputs.map((input) => layoutTree(input.tree, collapsed, measure));
  const placed = packBlocks(blocks);
  const frames = placed.map(({ x, y, block }, index): PlacedFrame => ({
    id: `frame:${root.inputs[index]!.tree.item.id}`,
    root: root.inputs[index]!.tree.item,
    x,
    y,
    ...frameSize(block),
    count: block.items.length,
  }));
  const board: GraphLayout = {
    items: placed.flatMap(({ x, y, block }, index) =>
      block.items.map((each) => ({
        ...each,
        x: each.x + x + FRAME_PADDING,
        y: each.y + y + FRAME_HEADER_HEIGHT,
        frame: frames[index]!.id,
      })),
    ),
    edges: blocks.flatMap((block) => block.edges),
    frames,
  };
  if (!withPreview) return board;

  const packedWidth = Math.max(0, ...frames.map((frame) => frame.x + frame.width));
  const { width, height } = sizeOf(root.item, false, measure);
  const preview: PlacedItem = {
    item: root.item,
    x: placed.length === 0 ? 0 : packedWidth + BLOCK_GAP,
    y: 0,
    width,
    height,
  };

  return {
    items: [...board.items, preview],
    edges: [...board.edges, ...root.inputs.map((input) => edgeOf(root, input))],
    frames,
  };
}

/**
 * One tree placed with its root rightmost and its top-left corner at the origin.
 *
 * Each depth is one column, as wide as its widest item. A leaf takes the next free row of
 * its column, and an item is placed level with the middle of its inputs. An item taller than
 * its inputs that would reach into the item above it moves down with its inputs.
 */
function layoutTree(
  root: GraphTree,
  collapsed: ReadonlySet<string>,
  measure: MeasureText,
): GraphLayout {
  const items: PlacedItem[] = [];
  const depths: number[] = [];
  const edges: LayoutEdge[] = [];
  const inputsOf = (tree: GraphTree) => (collapsed.has(tree.item.id) ? [] : tree.inputs);
  /* Measured once per item, since a struct's width measures every row. */
  const naturals = new Map<GraphTree, number>();
  const natural = (tree: GraphTree) =>
    naturals.get(tree) ??
    naturals.set(tree, widthOf(tree.item, collapsed.has(tree.item.id), measure)).get(tree)!;

  const widths: number[] = [];
  const widen = (tree: GraphTree, depth: number) => {
    widths[depth] = Math.max(widths[depth] ?? 0, natural(tree));
    inputsOf(tree).forEach((input) => widen(input.tree, depth + 1));
  };
  widen(root, 0);

  const total = widths.reduce((sum, width) => sum + width, 0) + COLUMN_GAP * (widths.length - 1);
  const rights = [total];
  widths.forEach((width, depth) => rights.push(rights[depth]! - width - COLUMN_GAP));

  let nextTop = 0;
  /* The first free top in each column, below the lowest item placed in it. */
  const floors: number[] = [];
  const lower = (depth: number, bottom: number) => {
    floors[depth] = Math.max(floors[depth] ?? -Infinity, bottom + ROW_GAP);
  };

  /** Move the items placed from `first` on down by `shift`. */
  function shiftFrom(first: number, shift: number) {
    for (let index = first; index < items.length; index += 1) {
      const moved = { ...items[index]!, y: items[index]!.y + shift };
      items[index] = moved;
      lower(depths[index]!, moved.y + moved.height);
    }
    nextTop += shift;
  }

  /** Place `tree` in the column at `depth`. Returns the item's vertical middle. */
  function place(tree: GraphTree, depth: number): number {
    const width = widths[depth]!;
    const height = heightOf(tree.item, collapsed.has(tree.item.id), width);
    const inputs = inputsOf(tree);
    const first = items.length;

    let top: number;
    if (inputs.length === 0) {
      top = Math.max(nextTop, floors[depth] ?? -Infinity);
      nextTop = top + height + ROW_GAP;
    } else {
      const middles = inputs.map((input) => place(input.tree, depth + 1));
      top = (middles[0]! + middles.at(-1)!) / 2 - height / 2;

      const overlap = (floors[depth] ?? -Infinity) - top;
      if (overlap > 0) {
        shiftFrom(first, overlap);
        top += overlap;
      }
    }

    const x = rights[depth]! - width;
    const { item } = tree;
    const nameWidth = nameWidthOf(item, measure);
    items.push({
      item,
      x,
      y: top,
      width,
      height,
      ...(nameWidth === undefined ? {} : { nameWidth }),
    });
    depths.push(depth);
    lower(depth, top + height);
    for (const input of inputs) edges.push(edgeOf(tree, input));
    return top + height / 2;
  }

  place(root, 0);

  const top = Math.min(0, ...items.map((each) => each.y));
  return { items: items.map((each) => ({ ...each, y: each.y - top })), edges, frames: [] };
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

/** The fields a master node draws, across its groups. */
function masterFields(item: MasterItem): MasterField[] {
  return item.groups.flatMap((group) => group.fields);
}

/** The name column a node's rows share, and undefined for a node that measures none. */
function nameWidthOf(item: GraphItem, measure: MeasureText): number | undefined {
  if (item.type === "struct") return structNameWidth(item, measure);
  if (item.type === "master") return fieldNameWidth(masterFields(item), measure);
  if (item.type === "render") return fieldNameWidth(item.fields, measure);
  return undefined;
}

/** A master, render or struct node's width: its name column beside its value column. */
function fieldNodeWidth(
  item: MasterItem | RenderItem | StructItem,
  folded: boolean,
  measure: MeasureText,
): number {
  if (item.type === "struct") return structWidth(item, measure);
  if (item.type === "master" && folded) return FOLDED_MASTER_WIDTH;

  const fields = item.type === "master" ? masterFields(item) : item.fields;
  return fieldNameWidth(fields, measure) + MASTER_VALUE_WIDTH;
}

/**
 * The size an item draws at alone, its width measured from its text.
 *
 * The node components size themselves from the same numbers. An item with no ports and no
 * body draws its header alone.
 */
export function sizeOf(
  item: GraphItem,
  folded = false,
  measure: MeasureText = estimateText,
): { width: number; height: number } {
  const width = widthOf(item, folded, measure);
  return { width, height: heightOf(item, folded, width) };
}

/** The width an item asks for, which its column may widen. */
function widthOf(item: GraphItem, folded: boolean, measure: MeasureText): number {
  switch (item.type) {
    case "preview":
      return PREVIEW_PORTS_WIDTH + PREVIEW_VIEWPORT.width;
    case "file":
      return FILE_NODE_WIDTH;
    case "value":
      return FIELD_NODE_WIDTH.value;
    case "component":
      return Math.max(naturalWidth(item, measure), FIELD_NODE_WIDTH.component);
    case "master":
    case "render":
    case "struct":
      return fieldNodeWidth(item, folded, measure);
    default:
      return naturalWidth(item, measure);
  }
}

/** The height an item draws at in a column `width` wide, which its preview's height follows. */
function heightOf(item: GraphItem, folded: boolean, width: number): number {
  if (item.type === "preview") {
    const ports = HEADER_HEIGHT + item.ports.length * LINE_HEIGHT + BODY_PADDING;
    return Math.max(ports, HEADER_HEIGHT + PREVIEW_VIEWPORT.height + BODY_PADDING);
  }

  if (item.type === "file") {
    return HEADER_HEIGHT + FRAME_EDGES + previewLine(item, width) + LINE_HEIGHT + 2 * FIELD_PADDING;
  }

  if (item.type === "value") {
    return VALUE_HEADER_HEIGHT + FRAME_EDGES + fieldLines(item) * LINE_HEIGHT + 2 * FIELD_PADDING;
  }

  if (item.type === "render") {
    const preview = renderPreviewed(item) ? previewLine(item, width) : 0;
    return (
      HEADER_HEIGHT + FRAME_EDGES + preview + fieldLines(item) * LINE_HEIGHT + 2 * FIELD_PADDING
    );
  }

  if (item.type === "component") {
    const body = item.lines.length === 0 ? 0 : item.lines.length * LINE_HEIGHT + 2 * FIELD_PADDING;
    return HEADER_HEIGHT + FRAME_EDGES + body;
  }

  if (item.type === "struct" && folded && isMaterial(item)) {
    return HEADER_HEIGHT + FRAME_EDGES + previewLine(item, width);
  }

  if (item.type === "master" || item.type === "struct") {
    const preview =
      item.type === "master" ? previewLine(item, width) : structPreviewLine(item, width);
    const rows =
      folded && item.type === "master" ? 0 : fieldLines(item) * LINE_HEIGHT + 2 * FIELD_PADDING;
    return HEADER_HEIGHT + FRAME_EDGES + preview + rows;
  }

  const rows = item.ports.length + (item.type === "driver" ? bodyLines(item.node) : 0);
  const body = rows === 0 ? 0 : rows * LINE_HEIGHT + BODY_PADDING;
  return HEADER_HEIGHT + FRAME_EDGES + body;
}

/**
 * The lines a master, struct or curve node draws, each one `LINE_HEIGHT` tall.
 *
 * A master draws each group's heading and fields, whose Add sits on the heading. A struct node
 * draws its rows and a list field its Add item line under them, and a value node its curve or
 * its editor, per `valueLines`.
 */
export function fieldLines(item: MasterItem | StructItem | ValueItem | RenderItem): number {
  switch (item.type) {
    case "master":
      return item.groups.reduce(
        (sum, each) =>
          sum +
          each.fields.reduce(
            (rows, field) => rows + (field.forces?.length ?? 1) + socketLines(item, field.input),
            0,
          ) +
          /* The heading, and a component group's socket line under it. */
          (componentOf(each.group) === null ? 1 : 2),
        0,
      );
    case "render":
      return renderLines(item);
    case "struct":
      return structLines(item);
    case "value":
      return valueLines(item);
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
