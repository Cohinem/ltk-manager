import { MiniMap, type ReactFlowState, useStore } from "@xyflow/react";

import { m } from "@/i18n";
import { useGraphMinimap } from "@/stores";

import { CANVAS_TONE, itemHue } from "../utils/graphTones";
import { allInView, type Box, viewBox } from "../utils/minimapView";
import type { CanvasNode } from "./canvasNodes";

/** The minimap's size in pixels. React Flow's default is 200 by 150. */
const SIZE = { width: 128, height: 96 } as const;

/** True when a part of the graph is outside the canvas's view. */
function partOutOfView(state: ReactFlowState): boolean {
  const boxes: Box[] = [];
  for (const node of state.nodeLookup.values()) {
    if (node.hidden) continue;

    const { x, y } = node.internals.positionAbsolute;
    boxes.push({ x, y, width: node.measured.width ?? 0, height: node.measured.height ?? 0 });
  }

  return !allInView(boxes, viewBox(state.transform, state.width, state.height));
}

function nodeColor(node: CanvasNode): string {
  return node.type === "frame" ? "transparent" : itemHue(node.data.placed.item);
}

/**
 * The Graph pane's minimap, in the canvas's bottom-right corner.
 *
 * It is drawn only while a part of the graph is outside the view and the toolbar's minimap
 * switch is on. "The minimap" in docs/ux/VFX_GRAPH.md.
 */
export function GraphMinimap() {
  const shown = useGraphMinimap();
  const needed = useStore(partOutOfView);
  if (!shown || !needed) return null;

  return (
    <MiniMap
      pannable
      zoomable
      ariaLabel={m.workshop_bin_graph_minimap_label()}
      nodeColor={nodeColor}
      nodeBorderRadius={4}
      bgColor={CANVAS_TONE.minimap}
      maskColor={CANVAS_TONE.mask}
      style={SIZE}
      className="overflow-hidden rounded-lg border border-surface-veil-strong"
    />
  );
}
