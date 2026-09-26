import "@xyflow/react/dist/base.css";

import {
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  CornersOutIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from "@phosphor-icons/react";
import {
  Background,
  BackgroundVariant,
  type BuiltInEdge,
  MiniMap,
  type NodeChange,
  type InternalNode,
  type NodeTypes,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useNodesState,
  useReactFlow,
  useStore,
  type XYPosition,
} from "@xyflow/react";
import {
  type CSSProperties,
  type ReactNode,
  use,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ContextMenu, IconButton, Tooltip } from "@/components";
import { m } from "@/i18n";

import type { GraphLayout, LayoutEdge } from "../utils/driverLayout";
import { type EdgeEnds, edgeLanes, sameLanes } from "../utils/edgeLanes";
import { chainThrough, reach } from "../utils/graphChain";
import {
  CANVAS_TONE,
  EDGE_TRANSITION,
  KIND_STROKE,
  itemHue,
  NEUTRAL_STROKE,
} from "../utils/graphTones";
import type { GraphItem } from "../utils/systemGraph";
import { MasterNodeView, StructNodeView, ValueNodeView } from "./EmitterNodes";
import { EmitterPreviewLayer } from "./EmitterPreview";
import { FileNodeView } from "./FileNode";
import { type GraphActions, GraphActionsContext } from "./graphActions";
import { GraphMenu } from "./GraphMenu";
import {
  ComponentNodeView,
  DriverNodeView,
  EmitterNodeView,
  type GraphFlowNode,
  OUTPUT_HANDLE,
  PreviewNodeView,
} from "./GraphNodes";
import { FAR_ZOOM } from "./NodeFrame";

const NODE_TYPES: NodeTypes = {
  preview: PreviewNodeView,
  emitter: EmitterNodeView,
  component: ComponentNodeView,
  driver: DriverNodeView,
  master: MasterNodeView,
  struct: StructNodeView,
  value: ValueNodeView,
  file: FileNodeView,
};

const FIT_VIEW = { padding: 0.08, maxZoom: 1, duration: 200 } as const;

interface GraphCanvasProps {
  layout: GraphLayout;
  /** Collapse every item that has inputs, or expand every item, at once. */
  onCollapseAll: (collapsed: boolean) => void;
  /** Draw the emitter previews, which a pane the reader cannot see leaves off. */
  previews: boolean;
}

/**
 * A graph layout on a React Flow canvas: nodes select, drag and reveal their row.
 *
 * Positions come from `layoutGraph`, and a dragged node keeps its place through a fold's new
 * layout until Reset layout, for the session only, since the bin stores no positions. A drag on empty canvas boxes nodes into the selection, Shift or Ctrl
 * adds to it, Ctrl+A selects every node and Escape none, and a drag on a selected node moves
 * the group. Hovering or selecting a node lights every path through it, and one selected
 * node fades the nodes off those paths. A right click opens `GraphMenu` on the node under
 * the pointer or on the canvas. Decision 2.8 of docs/plans/shimmer-driver-graph.md.
 */
export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas({ layout, onCollapseAll, previews }: GraphCanvasProps) {
  const actions = use(GraphActionsContext);
  const flow = useReactFlow();
  const placedNodes = useMemo(
    () =>
      layout.items.map(
        (placed) =>
          ({
            id: placed.item.id,
            type: placed.item.type,
            position: { x: placed.x, y: placed.y },
            data: { placed },
            width: placed.width,
            height: placed.height,
          }) as GraphFlowNode,
      ),
    [layout],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphFlowNode>(placedNodes);
  /* Where the reader dragged nodes, which a fold's new layout keeps until Reset layout. */
  const moved = useRef(new Map<string, XYPosition>());
  /* The node a fold was asked on, which the view keeps still while the layout moves. */
  const anchor = useRef<string | null>(null);
  useEffect(() => {
    const next = placedNodes.map((node) => {
      const position = moved.current.get(node.id);
      return position === undefined ? node : { ...node, position };
    });
    const held = anchor.current === null ? undefined : flow.getNode(anchor.current)?.position;
    const lands = next.find((node) => node.id === anchor.current)?.position;
    anchor.current = null;

    setNodes(next);
    if (held !== undefined && lands !== undefined) {
      const { x, y, zoom } = flow.getViewport();
      void flow.setViewport({
        x: x - (lands.x - held.x) * zoom,
        y: y - (lands.y - held.y) * zoom,
        zoom,
      });
    }
  }, [placedNodes, setNodes, flow]);
  const anchored = useMemo<GraphActions | null>(
    () =>
      actions === null
        ? null
        : {
            ...actions,
            toggleCollapsed: (id) => {
              anchor.current = id;
              actions.toggleCollapsed(id);
            },
            collapseOthers: (item) => {
              anchor.current = item.id;
              actions.collapseOthers(item);
            },
          },
    [actions],
  );
  const onChange = (changes: NodeChange<GraphFlowNode>[]) => {
    for (const change of changes) {
      if (change.type === "position" && change.position !== undefined) {
        moved.current.set(change.id, change.position);
      }
    }
    onNodesChange(changes);
  };
  const resetLayout = () => {
    moved.current.clear();
    setNodes(placedNodes);
  };

  const [hovered, setHovered] = useState<string | null>(null);
  const selectedKey = nodes
    .filter((node) => node.selected)
    .map((node) => node.id)
    .join("\n");
  const selectedChain = useMemo(
    () => (selectedKey === "" ? null : chainThrough(selectedKey.split("\n"), layout.edges)),
    [selectedKey, layout],
  );
  const focusChain = useMemo(() => {
    if (hovered === null) return selectedChain;

    const focus = selectedKey === "" ? [hovered] : [hovered, ...selectedKey.split("\n")];
    return chainThrough(focus, layout.edges);
  }, [hovered, selectedKey, selectedChain, layout]);

  /* A group picked to move keeps the board as it is, and one node fades what it does not reach. */
  const fadedBy = selectedKey.includes("\n") ? null : selectedChain;
  const shownNodes = useMemo(
    () =>
      fadedBy === null
        ? nodes
        : nodes.map((node) =>
            fadedBy.items.has(node.id) ? node : { ...node, className: FADED_NODE },
          ),
    [nodes, fadedBy],
  );

  const selectAll = (selected: boolean) =>
    setNodes((each) => each.map((node) => ({ ...node, selected })));

  /* Read off the measured handles, so the lanes follow a drag and a node's real rows. */
  const lanes = useStore(
    (state) => edgeLanes(layout.edges, (edge) => endsOf(state.nodeLookup, edge)),
    sameLanes,
  );
  const edges = useMemo(
    () =>
      layout.edges.map((edge): BuiltInEdge => {
        const lit = focusChain?.edges.has(edge.id) ?? false;
        const faded = focusChain !== null && !lit;
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: OUTPUT_HANDLE,
          targetHandle: edge.port,
          type: "smoothstep",
          pathOptions: { ...STEP_PATH, stepPosition: lanes.get(edge.id) },
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
      }),
    [layout, focusChain, lanes],
  );

  const [menuItem, setMenuItem] = useState<GraphItem | null>(null);
  const frame = (id: string) => {
    const shown = [...reach([id], layout.edges, "inputs")].map((each) => ({ id: each }));
    void flow.fitView({ ...FIT_VIEW, nodes: shown });
  };

  return (
    <GraphActionsContext value={anchored}>
      <ContextMenu.Root>
        <ContextMenu.Trigger
          data-ui="GraphCanvas"
          /* Focusable so a click on the canvas takes the keyboard, which Select all reads. */
          tabIndex={-1}
          className="min-h-0 flex-1 bg-surface-950/40 outline-none"
          onContextMenuCapture={() => setMenuItem(null)}
          onKeyDown={(event) => {
            if (typing(event.target)) return;

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
              event.preventDefault();
              selectAll(true);
            }
            if (event.key === "Escape") selectAll(false);
          }}
        >
          <ReactFlow
            style={SELECTION_STYLE}
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            panOnDrag={PAN_BUTTONS}
            multiSelectionKeyCode={ADD_KEYS}
            nodes={shownNodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onChange}
            onNodeMouseEnter={(_, node) => setHovered(node.id)}
            onNodeMouseLeave={() => setHovered(null)}
            onNodeDoubleClick={(_, node) => {
              const wire = (node as GraphFlowNode).data.placed.item.wire;
              if (wire !== "") actions?.reveal?.(wire);
            }}
            onNodeContextMenu={(_, node) => setMenuItem((node as GraphFlowNode).data.placed.item)}
            nodesConnectable={false}
            deleteKeyCode={null}
            zoomOnDoubleClick={false}
            panOnScroll
            zoomOnScroll={false}
            fitView
            fitViewOptions={FIT_VIEW}
            minZoom={0.1}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1.5}
              color={CANVAS_TONE.dots}
            />
            <ZoomDetail />
            {previews && <EmitterPreviewLayer />}
            <Controls onCollapseAll={onCollapseAll} />
            <MiniMap
              pannable
              zoomable
              ariaLabel={m.workshop_bin_graph_minimap_label()}
              nodeColor={(node: GraphFlowNode) => itemHue(node.data.placed.item)}
              nodeBorderRadius={4}
              bgColor={CANVAS_TONE.minimap}
              maskColor={CANVAS_TONE.mask}
              className="overflow-hidden rounded-lg border border-surface-veil-strong"
            />
          </ReactFlow>
        </ContextMenu.Trigger>
        <GraphMenu
          item={menuItem}
          onFit={() => void flow.fitView(FIT_VIEW)}
          onFrame={frame}
          onCollapseAll={onCollapseAll}
          onResetLayout={resetLayout}
        />
      </ContextMenu.Root>
    </GraphActionsContext>
  );
}

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
 * A drag on empty canvas draws a selection box, so the canvas pans with the middle button,
 * with Space held, or with the wheel.
 */
const PAN_BUTTONS = [1];

/** The keys a click or a box holds to add to the selection rather than replace it. */
const ADD_KEYS = ["Shift", "Control", "Meta"];

/* DS-TOKEN: the selection box and the box around a picked group, in the accent. */
const SELECTION_STYLE = {
  "--xy-selection-background-color": "color-mix(in srgb, var(--color-accent-500) 10%, transparent)",
  "--xy-selection-border": "1px solid color-mix(in srgb, var(--color-accent-400) 70%, transparent)",
} as CSSProperties;

/** Whether a key lands in a field of a node, whose own keys Select all must leave alone. */
function typing(target: EventTarget): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest("input, textarea, select") !== null)
  );
}

/**
 * Writes the zoom onto the canvas root as `--graph-zoom` and `data-detail`.
 *
 * The nodes read both from CSS, so crossing `FAR_ZOOM` or scaling a plate re-renders no node.
 */
function ZoomDetail() {
  const zoom = useStore((state) => state.transform[2]);
  const root = useStore((state) => state.domNode);

  useLayoutEffect(() => {
    if (root === null) return;

    root.style.setProperty("--graph-zoom", String(zoom));
    root.dataset.detail = zoom < FAR_ZOOM ? "far" : "near";
  }, [root, zoom]);

  return null;
}

/** An edge into the preview crosses the packed blocks, so it rests faint until lit. */
function restingOpacity(edge: LayoutEdge): number {
  return edge.target === PREVIEW_ID ? 0.35 : 1;
}

const PREVIEW_ID = "preview";

/** A node off the selection's paths, as React Flow classes its wrapper. */
const FADED_NODE = "opacity-40 transition-opacity";

/** Zoom, fit, and collapse or expand every node, in the canvas's top-right corner. */
function Controls({ onCollapseAll }: { onCollapseAll: (collapsed: boolean) => void }) {
  const flow = useReactFlow();

  return (
    <Panel
      position="top-right"
      /* DS-GROUND, DS-RADIUS */
      className="flex items-center gap-0.5 rounded-lg border border-surface-veil-strong bg-surface-800 p-0.5 shadow-md"
    >
      <ControlButton
        label={m.workshop_bin_graph_zoom_in_action()}
        onPress={() => void flow.zoomIn({ duration: 150 })}
      >
        <MagnifyingGlassPlusIcon weight="bold" className="h-4 w-4" />
      </ControlButton>
      <ControlButton
        label={m.workshop_bin_graph_zoom_out_action()}
        onPress={() => void flow.zoomOut({ duration: 150 })}
      >
        <MagnifyingGlassMinusIcon weight="bold" className="h-4 w-4" />
      </ControlButton>
      <ControlButton
        label={m.workshop_bin_graph_fit_action()}
        onPress={() => void flow.fitView(FIT_VIEW)}
      >
        <CornersOutIcon weight="bold" className="h-4 w-4" />
      </ControlButton>
      <ControlButton
        label={m.workshop_bin_graph_collapse_all_action()}
        onPress={() => onCollapseAll(true)}
      >
        <ArrowsInSimpleIcon weight="bold" className="h-4 w-4" />
      </ControlButton>
      <ControlButton
        label={m.workshop_bin_graph_expand_all_action()}
        onPress={() => onCollapseAll(false)}
      >
        <ArrowsOutSimpleIcon weight="bold" className="h-4 w-4" />
      </ControlButton>
    </Panel>
  );
}

function ControlButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <IconButton variant="ghost" size="xs" aria-label={label} icon={children} onClick={onPress} />
    </Tooltip>
  );
}
