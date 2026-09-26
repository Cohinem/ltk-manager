import {
  BezierCurveIcon,
  CaretDownIcon,
  CaretRightIcon,
  CubeIcon,
  DiceFiveIcon,
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
import {
  bodyLines,
  HEADER_HEIGHT,
  LINE_HEIGHT,
  type PlacedItem,
  PREVIEW_PORTS_WIDTH,
  PREVIEW_VIEWPORT,
} from "../utils/driverLayout";
import { KIND_NAME, KIND_TONE, LEVEL_TONE, NEUTRAL_SOCKET } from "../utils/graphTones";
import { itemSubtitle, itemTitle } from "../utils/nodeText";
import type {
  ComponentItem,
  DriverItem,
  EmitterItem,
  FileItem,
  GraphPort,
  MasterItem,
  PreviewItem,
  StructItem,
  ValueItem,
} from "../utils/systemGraph";
import { NodeBody } from "./DriverBody";
import { EmitterToggle } from "./EmitterToggle";
import { GraphActionsContext } from "./graphActions";
import { NEAR_ONLY, NodeFrame } from "./NodeFrame";

type PlacedOf<T> = Omit<PlacedItem, "item"> & { readonly item: T };

export type PreviewFlowNode = Node<{ placed: PlacedOf<PreviewItem> }, "preview">;
export type EmitterFlowNode = Node<{ placed: PlacedOf<EmitterItem> }, "emitter">;
export type ComponentFlowNode = Node<{ placed: PlacedOf<ComponentItem> }, "component">;
export type DriverFlowNode = Node<{ placed: PlacedOf<DriverItem> }, "driver">;
export type MasterFlowNode = Node<{ placed: PlacedOf<MasterItem> }, "master">;
export type StructFlowNode = Node<{ placed: PlacedOf<StructItem> }, "struct">;
export type ValueFlowNode = Node<{ placed: PlacedOf<ValueItem> }, "value">;
export type FileFlowNode = Node<{ placed: PlacedOf<FileItem> }, "file">;
export type GraphFlowNode =
  | PreviewFlowNode
  | EmitterFlowNode
  | ComponentFlowNode
  | DriverFlowNode
  | MasterFlowNode
  | StructFlowNode
  | ValueFlowNode
  | FileFlowNode;

/** The handle id every node but the preview outputs through. */
export const OUTPUT_HANDLE = "out";

/* DS-VEIL: a socket is a dot with no surface of its own. */
export const SOCKET =
  "h-2.5! w-2.5! min-h-0! min-w-0! rounded-full! border-2! border-surface-800! transition-transform hover:scale-125";

/** The system's live preview, fed by every shimmer emitter. */
export function PreviewNodeView({ data, selected }: NodeProps<PreviewFlowNode>) {
  const { item, width, height } = data.placed;
  const actions = use(GraphActionsContext);

  return (
    <NodeFrame width={width} height={height} selected={selected} item={item} plate="above">
      <NodeHeader icon={MonitorPlayIcon} iconTone="text-accent-400" title={itemTitle(item)} />
      <div className="flex min-h-0 flex-1 gap-2 pr-2 pb-2">
        <div className="flex shrink-0 flex-col" style={{ width: PREVIEW_PORTS_WIDTH }}>
          <Ports ports={item.ports} />
        </div>
        <div
          /* React Flow's classes that keep a drag or a wheel inside the viewport from panning
             or zooming the canvas. A right drag orbits the camera, so its release opens no
             menu. */
          className="nodrag nopan nowheel relative flex overflow-hidden rounded-md border border-surface-veil bg-surface-950"
          style={PREVIEW_VIEWPORT}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
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
    <NodeFrame width={width} height={height} selected={selected} item={item} dim={item.disabled}>
      <NodeHeader
        icon={SparkleIcon}
        iconTone="text-accent-400"
        title={itemTitle(item)}
        subtitle={itemSubtitle(item)}
        id={item.id}
        wire={item.wire}
        inputs={item.ports.length}
        divided={item.ports.length > 0}
        extra={<EmitterToggle wire={item.wire} disabled={item.disabled} />}
      />
      <Ports ports={item.ports} />
      <Output kind={null} side={Position.Top} />
    </NodeFrame>
  );
}

/** One component, fed by the driver graph of each dynamic property it holds. */
export function ComponentNodeView({ data, selected }: NodeProps<ComponentFlowNode>) {
  const { item, width, height } = data.placed;

  return (
    <NodeFrame width={width} height={height} selected={selected} item={item}>
      <NodeHeader
        icon={CubeIcon}
        iconTone="text-bin-class-text"
        title={itemTitle(item)}
        subtitle={itemSubtitle(item)}
        id={item.id}
        wire={item.wire}
        inputs={item.ports.length}
        divided={item.ports.length > 0}
      />
      <Ports ports={item.ports} />
      <Output kind={null} />
    </NodeFrame>
  );
}

/** One driver: its role and class, its kind, how far its reading is trusted, and its value. */
export function DriverNodeView({ data, selected }: NodeProps<DriverFlowNode>) {
  const { item, width, height } = data.placed;
  const { node, diagnostics } = item;
  const lines = bodyLines(node);

  return (
    <NodeFrame width={width} height={height} selected={selected} item={item}>
      <NodeHeader
        icon={iconOf(node)}
        iconTone={KIND_TONE[node.kind].text}
        title={itemTitle(item)}
        subtitle={itemSubtitle(item)}
        kind={node.kind}
        level={worstLevel(diagnostics, node)}
        wire={item.wire}
        divided={item.ports.length + lines > 0}
      />
      <Ports ports={item.ports} />
      {lines > 0 && (
        <div className="flex min-w-0 flex-col px-2">
          <NodeBody node={node} leaves={item.leaves} />
        </div>
      )}
      <Output kind={node.kind} />
    </NodeFrame>
  );
}

export function NodeHeader({
  icon: Glyph,
  iconTone,
  title,
  subtitle = "",
  kind,
  level = null,
  badge = null,
  id,
  wire,
  inputs = 0,
  folds = inputs > 0,
  divided = true,
  extra,
}: {
  icon: Icon;
  iconTone: string;
  title: string;
  subtitle?: string;
  /** A driver's output kind, named at the end of the subtitle line. */
  kind?: DriverKind;
  level?: SupportLevel | null;
  badge?: string | null;
  /** The item's id, which collapse keys on. Absent for a node that does not collapse. */
  id?: string;
  /** The row the node stands for, which Show in properties reveals. */
  wire?: string;
  inputs?: number;
  /** The node folds away its body or its inputs, which a node with inputs does. */
  folds?: boolean;
  /** Whether rows follow the header. A header-only node's frame edge is its divider. */
  divided?: boolean;
  /** A control drawn before the reveal button, such as an emitter's toggle. */
  extra?: ReactNode;
}) {
  const actions = use(GraphActionsContext);
  const collapsible = id !== undefined && folds;
  const collapsed = collapsible && (actions?.collapsed.has(id) ?? false);

  return (
    <div
      className={twMerge(
        "flex shrink-0 items-center gap-2 rounded-t-[inherit] bg-linear-to-b from-(--node-wash) to-transparent px-2",
        divided && "border-b border-surface-veil",
        NEAR_ONLY,
      )}
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
          {collapsed && inputs > 0 && (
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
        {(subtitle !== "" || kind !== undefined) && (
          <span className="flex min-w-0 items-center gap-2 font-mono text-meta">
            <span className="min-w-0 flex-1 truncate text-surface-400">{subtitle}</span>
            {kind !== undefined && (
              <span className={twMerge("shrink-0", KIND_TONE[kind].text)}>{KIND_NAME[kind]}</span>
            )}
          </span>
        )}
      </div>
      {extra}
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
          <PortLabel label={port.label} />
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

/** A port's path, its holders dimmed so the field it ends in reads first. */
export function PortLabel({ label }: { label: string }) {
  const split = label.lastIndexOf(".") + 1;

  return (
    <span className="min-w-0 flex-1 truncate font-mono text-code">
      <span className="text-surface-400">{label.slice(0, split)}</span>
      <span className="text-surface-100">{label.slice(split)}</span>
    </span>
  );
}

/** A node's one output handle. An emitter's is on its top edge, facing the preview. */
export function Output({
  kind,
  side = Position.Right,
}: {
  kind: DriverKind | null;
  side?: Position;
}) {
  return (
    <Handle
      type="source"
      position={side}
      id={OUTPUT_HANDLE}
      isConnectable={false}
      className={twMerge(SOCKET, socketFill(kind))}
    />
  );
}

export function socketFill(kind: DriverKind | null): string {
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
    case "random":
      return DiceFiveIcon;
    case "easing":
      return BezierCurveIcon;
    case "unknown":
    case "empty":
      return QuestionIcon;
    case "property":
      return FunctionIcon;
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
