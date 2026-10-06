import { type BuiltInEdge, type InternalNode, useStore } from "@xyflow/react";
import type { CSSProperties } from "react";

import type { LayoutEdge } from "../utils/driverLayout";
import { type EdgeEnds, edgeLanes, sameLanes } from "../utils/edgeLanes";
import { EDGE_TRANSITION, KIND_STROKE, NEUTRAL_STROKE } from "../utils/graphTones";
import type { GraphItem } from "../utils/systemGraph";
import { OUTPUT_HANDLE } from "./GraphNodes";

/** What an edge's own object carries: whether its wire animates, and where it turns. */
export interface EdgeLook {
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

/** The edges one canvas last built, by what each was built from. */
export type EdgeCache = Map<string, BuiltInEdge>;

/**
 * The canvas's edges, each the same object as last time where nothing it is built from
 * changed. `cache` is the canvas's own, and is left holding these edges alone.
 *
 * React Flow re-renders an edge whose object changes. A layout read again after an edit holds
 * new edge objects for the same wires, so the cache keys on the wire and not on the object.
 * The focus look is `edgeRule`'s, so a hover changes no edge.
 */
export function keptEdges(
  cache: EdgeCache,
  edges: readonly LayoutEdge[],
  look: (edge: LayoutEdge) => EdgeLook,
): BuiltInEdge[] {
  const next: EdgeCache = new Map();
  const kept = edges.map((edge) => {
    const drawn = look(edge);
    const key = [
      edge.id,
      edge.source,
      edge.target,
      edge.port,
      edge.kind,
      drawn.animated,
      drawn.lane,
    ].join("|");
    const built = cache.get(key) ?? buildEdge(edge, drawn);
    next.set(key, built);
    return built;
  });

  cache.clear();
  for (const [key, built] of next) cache.set(key, built);

  return kept;
}

function buildEdge(edge: LayoutEdge, { animated, lane }: EdgeLook): BuiltInEdge {
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
      /* Screen pixels at every zoom, so a zoomed-out board keeps its wires. */
      vectorEffect: "non-scaling-stroke",
      ...restingLook(edge),
    },
  };
}

/** The edges past which a focus changes the look at once, since a fade repaints every wire. */
const FADES_UP_TO = 300;

const FADED_EDGE_OPACITY = 0.2;

/**
 * A stylesheet drawing the wires of the canvas `scope`: each at rest, and under a focus the
 * wires of `lit` thick and every other one faded. `count` is how many wires the canvas holds.
 *
 * The look is a rule rather than each edge's own style, so a hover or a pick re-renders no
 * edge. A wire's width and opacity must stay out of its inline style, which would outrank this.
 */
export function edgeRule(scope: string, lit: ReadonlySet<string> | null, count: number): string {
  const edge = `#${CSS.escape(scope)} .react-flow__edge`;
  const path = ".react-flow__edge-path";
  const eased = count <= FADES_UP_TO ? `transition:${EDGE_TRANSITION};` : "";
  const rest = `${edge} ${path}{stroke-width:1.5px;opacity:var(--edge-rest,1);${eased}}`;
  if (lit === null) return rest;

  const kept = [...lit].map((id) => `[data-id="${CSS.escape(id)}"]`).join(",");
  if (kept === "") return `${rest}${edge} ${path}{opacity:${FADED_EDGE_OPACITY}}`;

  return (
    rest +
    `${edge}:not(${kept}) ${path}{opacity:${FADED_EDGE_OPACITY}}` +
    `${edge}:is(${kept}) ${path}{stroke-width:2.5px}`
  );
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

/**
 * The opacity an edge into the preview rests at, as the variable `edgeRule` reads. It crosses
 * the packed blocks, so it rests faint until lit.
 */
function restingLook(edge: LayoutEdge): CSSProperties {
  return edge.target === PREVIEW_ID ? ({ "--edge-rest": 0.35 } as CSSProperties) : {};
}

const PREVIEW_ID = "preview";
