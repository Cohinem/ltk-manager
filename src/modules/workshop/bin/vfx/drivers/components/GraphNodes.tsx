import {
  CaretDownIcon,
  CaretRightIcon,
  CubeIcon,
  FunctionIcon,
  type Icon,
  MathOperationsIcon,
  MonitorPlayIcon,
  NumberSquareOneIcon,
  QuestionIcon,
  SparkleIcon,
  TreeStructureIcon,
  WaveSineIcon,
} from "@phosphor-icons/react";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { type ReactNode, use } from "react";

import { Tooltip } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import type { DriverDiagnostic } from "../../engine/drivers/diagnostics";
import type { DriverKind, DriverNode, SupportLevel } from "../../engine/drivers/node";
import { driverClass } from "../../engine/drivers/registry";
import {
  HEADER_HEIGHT,
  LINE_HEIGHT,
  type PlacedItem,
  PREVIEW_PORTS_WIDTH,
  PREVIEW_VIEWPORT,
} from "../utils/driverLayout";
import { KIND_NAME, KIND_TONE, LEVEL_TONE, NEUTRAL_SOCKET } from "../utils/graphTones";
import type {
  ComponentItem,
  DriverItem,
  EmitterItem,
  GraphPort,
  PreviewItem,
} from "../utils/systemGraph";
import { NodeBody } from "./DriverBody";
import { GraphActionsContext } from "./graphActions";

type PlacedOf<T> = Omit<PlacedItem, "item"> & { readonly item: T };

export type PreviewFlowNode = Node<{ placed: PlacedOf<PreviewItem> }, "preview">;
export type EmitterFlowNode = Node<{ placed: PlacedOf<EmitterItem> }, "emitter">;
export type ComponentFlowNode = Node<{ placed: PlacedOf<ComponentItem> }, "component">;
export type DriverFlowNode = Node<{ placed: PlacedOf<DriverItem> }, "driver">;
export type GraphFlowNode = PreviewFlowNode | EmitterFlowNode | ComponentFlowNode | DriverFlowNode;

/** The handle id every node but the preview outputs through. */
export const OUTPUT_HANDLE = "out";

const EMITTER_CLASS = "VfxShimmerEmitterDefinitionData";

/* DS-VEIL: a socket is a dot with no surface of its own. */
const SOCKET =
  "h-2.5! w-2.5! min-h-0! min-w-0! rounded-full! border-2! border-surface-800! transition-transform hover:scale-125";

/** The system's live preview, fed by every shimmer emitter. */
export function PreviewNodeView({ data, selected }: NodeProps<PreviewFlowNode>) {
  const { item, width, height } = data.placed;
  const actions = use(GraphActionsContext);

  return (
    <NodeFrame width={width} height={height} selected={selected} tone="border-t-accent-500">
      <NodeHeader
        icon={MonitorPlayIcon}
        iconTone="text-accent-400"
        title={m.workshop_bin_pane_preview_label()}
      />
      <div className="flex min-h-0 flex-1 gap-2 pr-2 pb-2">
        <div className="flex shrink-0 flex-col" style={{ width: PREVIEW_PORTS_WIDTH }}>
          <Ports ports={item.ports} />
        </div>
        <div
          /* React Flow's classes that keep a drag or a wheel inside the viewport from panning
             or zooming the canvas. */
          className="nodrag nopan nowheel relative flex overflow-hidden rounded-md border border-surface-veil bg-surface-950"
          style={PREVIEW_VIEWPORT}
        >
          {actions?.viewport}
        </div>
      </div>
    </NodeFrame>
  );
}

/** One shimmer emitter, fed by each of its components. */
export function EmitterNodeView({ data, selected }: NodeProps<EmitterFlowNode>) {
  const { item, width, height } = data.placed;

  return (
    <NodeFrame
      width={width}
      height={height}
      selected={selected}
      tone="border-t-accent-400"
      dim={item.disabled}
    >
      <NodeHeader
        icon={SparkleIcon}
        iconTone="text-accent-400"
        title={item.name}
        subtitle={EMITTER_CLASS}
        badge={item.disabled ? m.workshop_bin_graph_disabled_label() : null}
        id={item.id}
        wire={item.wire}
        inputs={item.ports.length}
      />
      <Ports ports={item.ports} />
      <Output kind={null} />
    </NodeFrame>
  );
}

/** One component, fed by the driver graph of each dynamic property it holds. */
export function ComponentNodeView({ data, selected }: NodeProps<ComponentFlowNode>) {
  const { item, width, height } = data.placed;

  return (
    <NodeFrame width={width} height={height} selected={selected} tone="border-t-bin-class">
      <NodeHeader
        icon={CubeIcon}
        iconTone="text-bin-class-text"
        title={item.slot}
        subtitle={item.className}
        id={item.id}
        wire={item.wire}
        inputs={item.ports.length}
      />
      <Ports ports={item.ports} />
      <Output kind={null} />
    </NodeFrame>
  );
}

/** One driver: its class, its kind, how far its reading is trusted, and its value. */
export function DriverNodeView({ data, selected }: NodeProps<DriverFlowNode>) {
  const { item, width, height } = data.placed;
  const { node, diagnostics } = item;

  return (
    <NodeFrame width={width} height={height} selected={selected} tone={KIND_TONE[node.kind].edge}>
      <NodeHeader
        icon={iconOf(node)}
        iconTone={KIND_TONE[node.kind].text}
        title={titleOf(node)}
        subtitle={KIND_NAME[node.kind]}
        level={worstLevel(diagnostics, node)}
        wire={item.wire}
      />
      <Ports ports={item.ports} />
      <div className="flex min-w-0 flex-col px-2">
        <NodeBody node={node} leaves={item.leaves} />
      </div>
      <Output kind={node.kind} />
    </NodeFrame>
  );
}

function NodeFrame({
  width,
  height,
  selected,
  tone,
  dim = false,
  children,
}: {
  width: number;
  height: number;
  selected: boolean;
  /** The top edge's colour, which names the node's role or its output kind. */
  tone: string;
  dim?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-ui="SystemGraph:node"
      style={{ width, height }}
      /* DS-GROUND, DS-RADIUS, DS-HOVER */
      className={twMerge(
        "group/node flex flex-col rounded-lg border border-t-2 border-surface-veil-strong bg-surface-800 text-row shadow-md transition-[border-color,box-shadow] hover:border-accent-hover",
        tone,
        selected && "border-accent-500 ring-2 ring-accent-500/40 hover:border-accent-500",
        dim && "opacity-80",
      )}
    >
      {children}
    </div>
  );
}

function NodeHeader({
  icon: Glyph,
  iconTone,
  title,
  subtitle,
  level = null,
  badge = null,
  id,
  wire,
  inputs = 0,
}: {
  icon: Icon;
  iconTone: string;
  title: string;
  subtitle?: string;
  level?: SupportLevel | null;
  badge?: string | null;
  /** The item's id, which collapse keys on. Absent for a node that does not collapse. */
  id?: string;
  /** The row the node stands for, which Show in properties reveals. */
  wire?: string;
  inputs?: number;
}) {
  const actions = use(GraphActionsContext);
  const collapsible = id !== undefined && inputs > 0;
  const collapsed = collapsible && (actions?.collapsed.has(id) ?? false);

  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b border-surface-veil px-2"
      style={{ height: HEADER_HEIGHT }}
    >
      {collapsible && (
        <button
          type="button"
          aria-label={
            collapsed
              ? m.workshop_bin_graph_expand_action()
              : m.workshop_bin_graph_collapse_action()
          }
          aria-expanded={!collapsed}
          /* DS-VEIL, DS-RADIUS */
          className="nodrag -ml-1 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-surface-400 hover:bg-surface-veil hover:text-surface-100"
          onClick={() => actions?.toggleCollapsed(id)}
        >
          {collapsed ? (
            <CaretRightIcon weight="bold" className="h-3.5 w-3.5" />
          ) : (
            <CaretDownIcon weight="bold" className="h-3.5 w-3.5" />
          )}
        </button>
      )}
      <Glyph weight="duotone" className={twMerge("h-5 w-5 shrink-0", iconTone)} />
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate font-medium text-surface-100">{title}</span>
          {badge !== null && (
            <span className="shrink-0 rounded-sm bg-surface-veil px-1 text-meta text-surface-300">
              {badge}
            </span>
          )}
          {collapsed && (
            <span className="shrink-0 rounded-sm bg-surface-veil px-1 text-meta text-surface-300">
              {m.workshop_bin_graph_hidden_label({ count: inputs })}
            </span>
          )}
          {level === "inferred" && (
            <LevelMark
              label={m.workshop_bin_driver_inferred_label()}
              hint={m.workshop_bin_driver_inferred_hint()}
              tone={LEVEL_TONE.inferred}
            />
          )}
          {level === "unsupported" && (
            <LevelMark
              label={m.workshop_bin_driver_unsupported_label()}
              hint={m.workshop_bin_driver_unsupported_hint()}
              tone={LEVEL_TONE.unsupported}
            />
          )}
        </span>
        {subtitle !== undefined && subtitle !== "" && (
          <span className="truncate font-mono text-meta text-surface-400">{subtitle}</span>
        )}
      </div>
      {wire !== undefined && actions?.reveal && (
        <RevealButton onReveal={() => actions.reveal?.(wire)} />
      )}
    </div>
  );
}

function RevealButton({ onReveal }: { onReveal: () => void }) {
  const label = m.workshop_bin_show_in_properties_action();
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        /* DS-VEIL, DS-RADIUS */
        className="nodrag flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-surface-400 opacity-0 group-hover/node:opacity-100 hover:bg-surface-veil hover:text-surface-100 focus-visible:opacity-100"
        onClick={onReveal}
      >
        <TreeStructureIcon weight="bold" className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}

function LevelMark({ label, hint, tone }: { label: string; hint: string; tone: string }) {
  return (
    <Tooltip content={hint}>
      <span className={twMerge("shrink-0 rounded-sm px-1 text-meta", tone)}>{label}</span>
    </Tooltip>
  );
}

/** One row per input, each with the socket an edge lands on at the node's left edge. */
function Ports({ ports }: { ports: readonly GraphPort[] }) {
  return (
    <>
      {ports.map((port) => (
        <div
          key={port.id}
          className="relative flex shrink-0 items-center gap-2 pr-2 pl-3"
          style={{ height: LINE_HEIGHT }}
        >
          <Handle
            type="target"
            position={Position.Left}
            id={port.id}
            isConnectable={false}
            className={twMerge(SOCKET, socketFill(port.kind))}
          />
          <span className="min-w-0 flex-1 truncate font-mono text-code text-surface-200">
            {port.label}
          </span>
          {port.kind !== null && (
            <span className={twMerge("shrink-0 font-mono text-meta", KIND_TONE[port.kind].text)}>
              {KIND_NAME[port.kind]}
            </span>
          )}
        </div>
      ))}
    </>
  );
}

function Output({ kind }: { kind: DriverKind | null }) {
  return (
    <Handle
      type="source"
      position={Position.Right}
      id={OUTPUT_HANDLE}
      isConnectable={false}
      className={twMerge(SOCKET, socketFill(kind))}
    />
  );
}

function socketFill(kind: DriverKind | null): string {
  return kind === null ? NEUTRAL_SOCKET : KIND_TONE[kind].fill;
}

function iconOf(node: DriverNode): Icon {
  switch (node.type) {
    case "constant":
      return NumberSquareOneIcon;
    case "curve":
      return WaveSineIcon;
    case "operator":
      return MathOperationsIcon;
    case "unknown":
    case "empty":
      return QuestionIcon;
    case "property":
      return FunctionIcon;
  }
}

/** The class name the registry or the tables give, and the class hash for an unnamed one. */
function titleOf(node: DriverNode): string {
  switch (node.type) {
    case "unknown":
      if (node.value.type === "struct") return node.value.class ?? node.value.classHash;
      return m.workshop_bin_driver_unknown_label();
    case "empty":
      return m.workshop_bin_driver_empty_label();
    case "constant":
    case "curve":
    case "operator":
    case "property":
      return driverClass(node.classHash)?.name ?? node.classHash;
  }
}

/** The least trusted level a node reports. A class the registry does not read is unsupported. */
function worstLevel(
  diagnostics: readonly DriverDiagnostic[],
  node: DriverNode,
): SupportLevel | null {
  if (diagnostics.some((each) => each.level === "unsupported")) return "unsupported";
  if (diagnostics.some((each) => each.level === "inferred")) return "inferred";
  if (node.type === "unknown") return "unsupported";
  return null;
}
