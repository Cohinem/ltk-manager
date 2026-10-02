import { type BuiltInEdge, type InternalNode, useStore } from "@xyflow/react";

import type { LayoutEdge } from "../utils/driverLayout";
import { type EdgeEnds, edgeLanes, sameLanes } from "../utils/edgeLanes";
import { EDGE_TRANSITION, KIND_STROKE, NEUTRAL_STROKE } from "../utils/graphTones";
import type { GraphItem } from "../utils/systemGraph";
import { OUTPUT_HANDLE } from "./GraphNodes";

/** How one edge draws: lit on a focused path, faded off it, animated, and where it turns. */
export interface EdgeLook {
  readonly lit: boolean;
  readonly faded: boolean;
  readonly animated: boolean;
  readonly lane: number | undefined;
}

/** A keyed or random value, or a driver curve or random range, whose wire animates. */
export function changesOverTime(item: GraphItem): boolean {
  if (item.type === "value") return true;
  if (item.type !== "driver") return false;
  return (
    item.node.type === "random" || (item.node.type === "curve" && item.node.curve.keys.length > 1)
  );
}

/* The lanes last read per nodes array, so a pan or a zoom reads no handle. */
const LANES = new WeakMap<
  object,
  { edges: readonly LayoutEdge[]; lanes: ReadonlyMap<string, number> }
>();

/**
 * Where each edge turns, read off the measured handles so the lanes follow a drag and a
 * node's real rows. The store's nodes array changes on a drag or a measure and not on a pan,
 * so the lanes are read once per nodes array.
 */
export function useLanes(edges: readonly LayoutEdge[]): ReadonlyMap<string, number> {
  return useStore((state) => {
    const held = LANES.get(state.nodes);
    if (held?.edges === edges) return held.lanes;

    const lanes = edgeLanes(edges, (edge) => endsOf(state.nodeLookup, edge));
    LANES.set(state.nodes, { edges, lanes });
    return lanes;
  }, sameLanes);
}

/* The edge last built from each layout edge, and the look it was built for. */
const BUILT = new WeakMap<LayoutEdge, { key: string; edge: BuiltInEdge }>();

/**
 * The canvas's edges, each the same object as last time where its look has not changed.
 *
 * React Flow re-renders an edge whose object changes, so hovering a node redraws only the
 * edges it lights or fades.
 */
export function keptEdges(
  edges: readonly LayoutEdge[],
  look: (edge: LayoutEdge) => EdgeLook,
): BuiltInEdge[] {
  return edges.map((edge) => {
    const drawn = look(edge);
    const key = `${drawn.lit}|${drawn.faded}|${drawn.animated}|${drawn.lane}`;
    const held = BUILT.get(edge);
    if (held?.key === key) return held.edge;

    const built = buildEdge(edge, drawn);
    BUILT.set(edge, { key, edge: built });
    return built;
  });
}

function buildEdge(edge: LayoutEdge, { lit, faded, animated, lane }: EdgeLook): BuiltInEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: OUTPUT_HANDLE,
    targetHandle: edge.port,
    type: "smoothstep",
    animated,
    pathOptions: { ...STEP_PATH, stepPosition: lane },
    focusable: false,
    style: {
      stroke: edge.kind === null ? NEUTRAL_STROKE : KIND_STROKE[edge.kind],
      strokeWidth: lit ? 2.5 : 1.5,
      opacity: faded ? 0.2 : restingOpacity(edge),
      transition: EDGE_TRANSITION,
      /* Screen pixels at every zoom, so a zoomed-out board keeps its wires. */
      vectorEffect: "non-scaling-stroke",
    },
  };
}

/**
 * A stylesheet fading every node of the canvas `scope` except `lit`.
 *
 * The fade is a rule rather than a class on each node, so a pick re-renders no node.
 */
export function fadeRule(scope: string, lit: ReadonlySet<string>): string {
  const nodes = `#${CSS.escape(scope)} .react-flow__node:not(.react-flow__node-frame)`;
  const kept = [...lit].map((id) => `[data-id="${CSS.escape(id)}"]`).join(",");
  const faded = kept === "" ? nodes : `${nodes}:not(${kept})`;
  return `${nodes}{transition:opacity 150ms}${faded}{opacity:${FADED_OPACITY}}`;
}

const FADED_OPACITY = 0.4;

/** Where `edge` leaves its source's output and lands on its port, once both are measured. */
function endsOf(lookup: ReadonlyMap<string, InternalNode>, edge: LayoutEdge): EdgeEnds | null {
  const from = lookup.get(edge.source);
  const into = lookup.get(edge.target);
  const out = from?.internals.handleBounds?.source?.[0];
  const port = into?.internals.handleBounds?.target?.find((each) => each.id === edge.port);
  if (from === undefined || into === undefined || out == null || port === undefined) return null;

  return {
    from: from.internals.positionAbsolute.y + out.y + out.height / 2,
    to: into.internals.positionAbsolute.y + port.y + port.height / 2,
  };
}

/** Wires run in right angles, rounded at each turn, and leave a socket before they turn. */
const STEP_PATH = { borderRadius: 8, offset: 16 } as const;

/** An edge into the preview crosses the packed blocks, so it rests faint until lit. */
function restingOpacity(edge: LayoutEdge): number {
  return edge.target === PREVIEW_ID ? 0.35 : 1;
}

const PREVIEW_ID = "preview";
