import type { Node, NodeProps } from "@xyflow/react";
import { use } from "react";

import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { rowKey } from "../../../tree/utils/binRows";
import { FRAME_HEADER_HEIGHT, type PlacedFrame } from "../utils/driverLayout";
import { itemHue } from "../utils/graphTones";
import { itemTitle } from "../utils/nodeText";
import { GraphActionsContext } from "./graphActions";
import { AbovePlate, NEAR_ONLY } from "./NodeFrame";
import { NodeLayerMark } from "./NodeLayerMark";

export type FrameFlowNode = Node<{ frame: PlacedFrame }, "frame">;

/** The class of a frame's header, the one part of a frame a drag picks up. */
export const FRAME_HANDLE = "graph-frame-handle";

/**
 * The wrapper class of a frame node. Its body passes the pointer through, so a selection box
 * or a pan starts inside it, and only its header takes a drag.
 */
export const FRAME_NODE = "pointer-events-none!";

/** The far zoom's title over a frame, larger than a node's so the board reads by emitter. */
const FAR_TITLE_SIZE = 20;

/**
 * An emitter's frame: a parent node behind the emitter and every node feeding it.
 *
 * A drag on its header moves them together, and a double click on the header frames them.
 * Decision 2.8 of docs/plans/shimmer-driver-graph.md.
 */
export function FrameNodeView({ data }: NodeProps<FrameFlowNode>) {
  const { frame } = data;
  const title = itemTitle(frame.root);
  const entry = use(GraphActionsContext)?.entry ?? "";
  const key = entry === "" ? null : rowKey({ entry, path: frame.root.wire });

  return (
    <div
      data-ui="EmitterFrame"
      data-type-scale="board"
      /* DS-GROUND, DS-RADIUS */
      className="relative size-full rounded-xl border border-surface-veil bg-surface-900/30"
    >
      <div
        className={twMerge(
          FRAME_HANDLE,
          "pointer-events-auto flex cursor-grab items-center gap-2 rounded-t-xl px-3 hover:bg-surface-veil-soft active:cursor-grabbing",
          NEAR_ONLY,
        )}
        style={{ height: FRAME_HEADER_HEIGHT }}
      >
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ background: itemHue(frame.root) }}
        />
        <span className="min-w-0 truncate text-row font-medium text-surface-200">{title}</span>
        <span className="shrink-0 text-meta text-surface-400">
          {m.workshop_bin_graph_frame_count_label({ count: frame.count })}
        </span>
        {key !== null && <NodeLayerMark rowKey={key} />}
      </div>
      <AbovePlate
        title={title}
        size={FAR_TITLE_SIZE}
        lead={
          key !== null && (
            <NodeLayerMark rowKey={key} size={`calc(${FAR_TITLE_SIZE}px / var(--graph-zoom, 1))`} />
          )
        }
      />
    </div>
  );
}
