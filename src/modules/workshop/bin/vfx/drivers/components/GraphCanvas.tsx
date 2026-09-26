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
  type Edge,
  MiniMap,
  type NodeTypes,
  Panel,
  ReactFlow,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { type ReactNode, use, useEffect, useMemo, useState } from "react";

import { IconButton, Tooltip } from "@/components";
import { m } from "@/i18n";

import type { GraphLayout } from "../utils/driverLayout";
import {
  CANVAS_TONE,
  EDGE_TRANSITION,
  KIND_STROKE,
  minimapTone,
  NEUTRAL_STROKE,
} from "../utils/graphTones";
import { GraphActionsContext } from "./graphActions";
import {
  ComponentNodeView,
  DriverNodeView,
  EmitterNodeView,
  type GraphFlowNode,
  OUTPUT_HANDLE,
  PreviewNodeView,
} from "./GraphNodes";

const NODE_TYPES: NodeTypes = {
  preview: PreviewNodeView,
  emitter: EmitterNodeView,
  component: ComponentNodeView,
  driver: DriverNodeView,
};

const FIT_VIEW = { padding: 0.08, maxZoom: 1, duration: 200 } as const;

interface GraphCanvasProps {
  layout: GraphLayout;
  /** Collapse every item that has inputs, or expand every item, at once. */
  onCollapseAll: (collapsed: boolean) => void;
}

/**
 * A graph layout on a React Flow canvas: nodes select, drag and reveal their row.
 *
 * Positions come from `layoutGraph` and a drag holds for the session only, since the bin
 * stores no positions. Hovering a node brings its own edges forward. Decision 2.8 of
 * docs/plans/shimmer-driver-graph.md.
 */
export function GraphCanvas({ layout, onCollapseAll }: GraphCanvasProps) {
  const actions = use(GraphActionsContext);
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
  useEffect(() => setNodes(placedNodes), [placedNodes, setNodes]);

  const [hovered, setHovered] = useState<string | null>(null);
  const selected = useMemo(
    () => new Set(nodes.filter((node) => node.selected).map((node) => node.id)),
    [nodes],
  );
  const focusing = hovered !== null || selected.size > 0;

  const edges = useMemo(
    () =>
      layout.edges.map((edge): Edge => {
        const lit =
          edge.source === hovered ||
          edge.target === hovered ||
          selected.has(edge.source) ||
          selected.has(edge.target);
        const faded = focusing && !lit;
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: OUTPUT_HANDLE,
          targetHandle: edge.port,
          focusable: false,
          style: {
            stroke: edge.kind === null ? NEUTRAL_STROKE : KIND_STROKE[edge.kind],
            strokeWidth: lit ? 2.5 : 1.5,
            opacity: faded ? 0.25 : 1,
            transition: EDGE_TRANSITION,
          },
        };
      }),
    [layout, hovered, selected, focusing],
  );

  return (
    <div data-ui="GraphCanvas" className="min-h-0 flex-1 bg-surface-950/40">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onNodeMouseEnter={(_, node) => setHovered(node.id)}
        onNodeMouseLeave={() => setHovered(null)}
        onNodeDoubleClick={(_, node) => {
          const wire = (node as GraphFlowNode).data.placed.item.wire;
          if (wire !== "") actions?.reveal?.(wire);
        }}
        nodesConnectable={false}
        deleteKeyCode={null}
        zoomOnDoubleClick={false}
        fitView
        fitViewOptions={FIT_VIEW}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color={CANVAS_TONE.dots} />
        <Controls onCollapseAll={onCollapseAll} />
        <MiniMap
          pannable
          zoomable
          ariaLabel={m.workshop_bin_graph_minimap_label()}
          nodeColor={(node: GraphFlowNode) => minimapTone(node.data.placed.item)}
          nodeBorderRadius={4}
          bgColor={CANVAS_TONE.minimap}
          maskColor={CANVAS_TONE.mask}
          className="overflow-hidden rounded-lg border border-surface-veil-strong"
        />
      </ReactFlow>
    </div>
  );
}

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
