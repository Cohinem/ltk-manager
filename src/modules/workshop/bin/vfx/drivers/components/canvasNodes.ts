import type { XYPosition } from "@xyflow/react";

import { FRAME_PADDING, type GraphLayout, type PlacedFrame } from "../utils/driverLayout";
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
 * `nodes` with the reader's drags laid over them, and each frame grown to hold the nodes
 * dragged past its edge, as React Flow grows it during the drag.
 */
export function withMoves(
  nodes: readonly CanvasNode[],
  moved: ReadonlyMap<string, XYPosition>,
): CanvasNode[] {
  const placed = nodes.map((node) => {
    const position = moved.get(node.id);
    return position === undefined ? node : { ...node, position };
  });

  const reach = new Map<string, { width: number; height: number }>();
  for (const node of placed) {
    if (node.parentId === undefined) continue;

    const held = reach.get(node.parentId) ?? { width: 0, height: 0 };
    reach.set(node.parentId, {
      width: Math.max(held.width, node.position.x + (node.width ?? 0) + FRAME_PADDING),
      height: Math.max(held.height, node.position.y + (node.height ?? 0) + FRAME_PADDING),
    });
  }

  return placed.map((node) => {
    const held = reach.get(node.id);
    if (held === undefined) return node;

    const width = Math.max(node.width ?? 0, held.width);
    const height = Math.max(node.height ?? 0, held.height);
    return width === node.width && height === node.height ? node : { ...node, width, height };
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
