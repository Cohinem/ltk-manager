import "@xyflow/react/dist/base.css";

import {
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  CornersOutIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  MonitorPlayIcon,
} from "@phosphor-icons/react";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  type NodeChange,
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
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ContextMenu, IconButton, Tooltip } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import type { GraphLayout } from "../utils/driverLayout";
import { chainThrough, reach } from "../utils/graphChain";
import { CANVAS_TONE, itemHue } from "../utils/graphTones";
import type { GraphItem } from "../utils/systemGraph";
import { type CanvasNode, canvasPosition, layoutNodes, withMoves } from "./canvasNodes";
import { ComponentNodeView } from "./ComponentNode";
import { FrameNodeView } from "./EmitterFrame";
import { MasterNodeView, StructNodeView, ValueNodeView } from "./EmitterNodes";
import { EmitterPreviewLayer } from "./EmitterPreview";
import { FileNodeView } from "./FileNode";
import { type GraphActions, GraphActionsContext, SolePick, SolePickContext } from "./graphActions";
import { changesOverTime, fadeRule, keptEdges, useLanes } from "./graphEdges";
import { GraphMenu } from "./GraphMenu";
import { DriverNodeView, EmitterNodeView, PreviewNodeView } from "./GraphNodes";
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
  frame: FrameNodeView,
};

const FIT_VIEW = { padding: 0.08, maxZoom: 1, duration: 200 } as const;

interface GraphCanvasProps {
  layout: GraphLayout;
  /** Collapse every item that has inputs, or expand every item, at once. */
  onCollapseAll: (collapsed: boolean) => void;
  /** Draw the emitter previews, which a pane the reader cannot see leaves off. */
  previews: boolean;
  /** The system's preview is a node of the graph rather than the Preview pane's. */
  previewed: boolean;
  onPreviewedChange: (previewed: boolean) => void;
}

/**
 * A graph layout on a React Flow canvas: nodes select, drag and reveal their row.
 *
 * Positions come from `layoutGraph`, and a dragged node or emitter frame keeps its place
 * through a fold's new layout until Reset layout, for the session only, since the bin stores
 * no positions. A drag on empty canvas boxes nodes into the selection, Shift or Ctrl adds to it, Ctrl+A selects every node and Escape none, and a drag on a selected node moves
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

function Canvas({
  layout,
  onCollapseAll,
  previews,
  previewed,
  onPreviewedChange,
}: GraphCanvasProps) {
  const actions = use(GraphActionsContext);
  const flow = useReactFlow();
  const placedNodes = useMemo(() => layoutNodes(layout), [layout]);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(placedNodes);
  /* Where the reader dragged nodes, which a fold's new layout keeps until Reset layout. */
  const moved = useRef(new Map<string, XYPosition>());
  /* The node a fold was asked on, which the view keeps still while the layout moves. */
  const anchor = useRef<string | null>(null);
  useEffect(() => {
    const next = withMoves(placedNodes, moved.current);
    const held =
      anchor.current === null
        ? undefined
        : flow.getInternalNode(anchor.current)?.internals.positionAbsolute;
    const lands = anchor.current === null ? undefined : canvasPosition(next, anchor.current);
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
  const onChange = (changes: NodeChange<CanvasNode>[]) => {
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
  const [menuItem, setMenuItem] = useState<GraphItem | null>(null);
  const selectedKey = nodes
    .filter((node) => node.selected)
    .map((node) => node.id)
    .join("\n");
  const [sole] = useState(() => new SolePick());
  useEffect(() => {
    sole.set(selectedKey === "" || selectedKey.includes("\n") ? null : selectedKey);
  }, [sole, selectedKey]);
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
  const scope = useId();
  const fade = useMemo(
    () => (fadedBy === null ? null : fadeRule(scope, fadedBy.items)),
    [scope, fadedBy],
  );

  const selectAll = (selected: boolean) =>
    setNodes((each) => each.map((node) => (node.type === "frame" ? node : { ...node, selected })));

  const lanes = useLanes(layout.edges);
  const dynamic = useMemo(
    () =>
      new Set(layout.items.filter(({ item }) => changesOverTime(item)).map(({ item }) => item.id)),
    [layout],
  );
  const edges = useMemo(
    () =>
      keptEdges(layout.edges, (edge) => {
        const lit = focusChain?.edges.has(edge.id) ?? false;
        return {
          lit,
          faded: focusChain !== null && !lit,
          animated: dynamic.has(edge.source),
          lane: lanes.get(edge.id),
        };
      }),
    [layout, focusChain, lanes, dynamic],
  );

  const onNodeMouseEnter = useCallback((_: unknown, node: CanvasNode) => {
    if (node.type !== "frame") setHovered(node.id);
  }, []);
  const onNodeMouseLeave = useCallback(() => setHovered(null), []);
  const onNodeDoubleClick = useCallback(
    (_: unknown, node: CanvasNode) => {
      if (node.type === "frame") {
        void flow.fitView({ ...FIT_VIEW, nodes: [{ id: node.id }] });
        return;
      }

      const wire = node.data.placed.item.wire;
      if (wire !== "") actions?.reveal?.(wire);
    },
    [actions, flow],
  );
  const onNodeContextMenu = useCallback((_: unknown, node: CanvasNode) => {
    setMenuItem(node.type === "frame" ? node.data.frame.root : node.data.placed.item);
  }, []);

  const frame = (id: string) => {
    const shown = [...reach([id], layout.edges, "inputs")].map((each) => ({ id: each }));
    void flow.fitView({ ...FIT_VIEW, nodes: shown });
  };

  return (
    <GraphActionsContext value={anchored}>
      <SolePickContext value={sole}>
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
            {fade !== null && <style>{fade}</style>}
            <ReactFlow
              id={scope}
              style={SELECTION_STYLE}
              selectionOnDrag
              selectionMode={SelectionMode.Partial}
              panOnDrag={PAN_BUTTONS}
              multiSelectionKeyCode={ADD_KEYS}
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              onNodesChange={onChange}
              onNodeMouseEnter={onNodeMouseEnter}
              onNodeMouseLeave={onNodeMouseLeave}
              onNodeDoubleClick={onNodeDoubleClick}
              onNodeContextMenu={onNodeContextMenu}
              nodesConnectable={false}
              deleteKeyCode={null}
              zoomOnDoubleClick={false}
              panOnScroll
              zoomOnScroll={false}
              fitView
              fitViewOptions={FIT_VIEW}
              minZoom={0.1}
              maxZoom={2}
              proOptions={PRO_OPTIONS}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1.5}
                color={CANVAS_TONE.dots}
              />
              <ZoomDetail />
              {previews && <EmitterPreviewLayer />}
              <Controls
                onCollapseAll={onCollapseAll}
                previewed={previewed}
                onPreviewedChange={onPreviewedChange}
              />
              <MiniMap
                pannable
                zoomable
                ariaLabel={m.workshop_bin_graph_minimap_label()}
                nodeColor={minimapColor}
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
      </SolePickContext>
    </GraphActionsContext>
  );
}

const PRO_OPTIONS = { hideAttribution: true } as const;

function minimapColor(node: CanvasNode): string {
  return node.type === "frame" ? "transparent" : itemHue(node.data.placed.item);
}

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

interface ControlsProps {
  onCollapseAll: (collapsed: boolean) => void;
  previewed: boolean;
  onPreviewedChange: (previewed: boolean) => void;
}

/**
 * Zoom, fit, collapse or expand every node, and the preview node's switch, in the canvas's
 * top-right corner.
 */
function Controls({ onCollapseAll, previewed, onPreviewedChange }: ControlsProps) {
  const flow = useReactFlow();
  const previewLabel = previewed
    ? m.workshop_bin_graph_preview_hide_action()
    : m.workshop_bin_graph_preview_show_action();

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
      <ControlButton
        label={previewLabel}
        pressed={previewed}
        onPress={() => onPreviewedChange(!previewed)}
      >
        <MonitorPlayIcon weight="bold" className="h-4 w-4" />
      </ControlButton>
    </Panel>
  );
}

function ControlButton({
  label,
  pressed,
  onPress,
  children,
}: {
  label: string;
  /** The button is a switch, and this is its state. Absent for a one-shot action. */
  pressed?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <IconButton
        variant="ghost"
        size="xs"
        aria-label={label}
        aria-pressed={pressed}
        /* DS-VEIL */
        className={twMerge(pressed === true && "bg-surface-veil-strong text-accent-400")}
        icon={children}
        onClick={onPress}
      />
    </Tooltip>
  );
}
