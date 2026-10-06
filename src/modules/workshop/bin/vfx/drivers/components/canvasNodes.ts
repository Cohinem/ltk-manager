import type { XYPosition } from "@xyflow/react";

import {
  BLOCK_GAP,
  FRAME_PADDING,
  type GraphLayout,
  type PlacedFrame,
  ROW_GAP,
} from "../utils/driverLayout";
import { type Box, pushedApart, pushedDown } from "../utils/pushApart";
import { FRAME_HANDLE, FRAME_NODE, type FrameFlowNode } from "./EmitterFrame";
import type { GraphFlowNode } from "./GraphNodes";

/** A node of the canvas: a graph item, or an emitter's frame. */
export type CanvasNode = GraphFlowNode | FrameFlowNode;

/**
 * The canvas nodes of a layout. Each frame comes before the items it holds, since React Flow
 * reads a parent before its children, and an item in a frame sits relative to the frame.
 */
export function layoutNodes(layout: GraphLayout): CanvasNode[] {
  const frames = new Map(layout.frames.map((frame) => [frame.id, frame]));
  const items = layout.items.map((placed) => {
    const frame = placed.frame === undefined ? undefined : frames.get(placed.frame);
    const node = {
      id: placed.item.id,
      type: placed.item.type,
      position: { x: placed.x, y: placed.y },
      data: { placed },
      width: placed.width,
      height: placed.height,
    } as GraphFlowNode;
    if (frame === undefined) return node;

    return {
      ...node,
      position: { x: placed.x - frame.x, y: placed.y - frame.y },
      parentId: frame.id,
      expandParent: true,
    };
  });

  return [...layout.frames.map(frameNode), ...items];
}

function frameNode(frame: PlacedFrame): FrameFlowNode {
  return {
    id: frame.id,
    type: "frame",
    position: { x: frame.x, y: frame.y },
    data: { frame },
    width: frame.width,
    height: frame.height,
    selectable: false,
    focusable: false,
    dragHandle: `.${FRAME_HANDLE}`,
    className: FRAME_NODE,
  };
}

/**
 * `nodes` with the reader's drags laid over them, and no two of them overlapping.
 *
 * A dragged node keeps its place through a new layout, so a node that grew or a frame that
 * moved can land on it. The items of each frame are pushed down off each other, each frame
 * grows to the items past its edge as React Flow grows it during a drag, and the frames are
 * then pushed apart with a dragged frame keeping its place before an undragged one. Per "The
 * board" in docs/ux/VFX_GRAPH.md.
 */
export function withMoves(
  nodes: readonly CanvasNode[],
  moved: ReadonlyMap<string, XYPosition>,
): CanvasNode[] {
  const placed = nodes.map((node) => {
    const position = moved.get(node.id);
    return position === undefined ? node : { ...node, position };
  });
  const framed = placed.some((node) => node.type === "frame");
  const spaced = at(placed, itemPlaces(placed, framed));

  const reach = new Map<string, { width: number; height: number }>();
  for (const node of spaced) {
    if (node.parentId === undefined) continue;

    const frame = reach.get(node.parentId) ?? { width: 0, height: 0 };
    reach.set(node.parentId, {
      width: Math.max(frame.width, node.position.x + (node.width ?? 0) + FRAME_PADDING),
      height: Math.max(frame.height, node.position.y + (node.height ?? 0) + FRAME_PADDING),
    });
  }
  const grown = spaced.map((node) => {
    const frame = reach.get(node.id);
    if (frame === undefined) return node;

    const width = Math.max(node.width ?? 0, frame.width);
    const height = Math.max(node.height ?? 0, frame.height);
    return width === node.width && height === node.height ? node : { ...node, width, height };
  });
  if (!framed) return grown;

  const board = grown.filter((node) => node.parentId === undefined).map(boxOf);
  return at(grown, pushedApart(board, BLOCK_GAP, new Set(moved.keys())));
}

function boxOf(node: CanvasNode): Box {
  return {
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    width: node.width ?? 0,
    height: node.height ?? 0,
  };
}

/**
 * Where the items of each tree sit once none overlaps another of its tree: the items of each
 * frame, or every node of a layout that has no frames.
 */
function itemPlaces(nodes: readonly CanvasNode[], framed: boolean): Box[] {
  const trees = new Map<string | undefined, Box[]>();
  for (const node of nodes) {
    if (framed && node.parentId === undefined) continue;

    const tree = trees.get(node.parentId);
    if (tree === undefined) trees.set(node.parentId, [boxOf(node)]);
    else tree.push(boxOf(node));
  }

  return [...trees.values()].flatMap((tree) => pushedDown(tree, ROW_GAP));
}

/** `nodes` with each node of `places` at its place there, and every other node as it is. */
function at(nodes: readonly CanvasNode[], places: readonly Box[]): CanvasNode[] {
  const byId = new Map(places.map((place) => [place.id, place]));

  return nodes.map((node) => {
    const place = byId.get(node.id);
    if (place === undefined) return node;
    if (place.x === node.position.x && place.y === node.position.y) return node;

    return { ...node, position: { x: place.x, y: place.y } };
  });
}

/** Where node `id` of `nodes` sits on the canvas: its own place, plus its frame's. */
export function canvasPosition(nodes: readonly CanvasNode[], id: string): XYPosition | undefined {
  const node = nodes.find((each) => each.id === id);
  if (node === undefined) return undefined;
  if (node.parentId === undefined) return node.position;

  const parent = canvasPosition(nodes, node.parentId);
  if (parent === undefined) return node.position;

  return { x: parent.x + node.position.x, y: parent.y + node.position.y };
}
