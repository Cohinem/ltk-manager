import {
  CubeIcon,
  HourglassMediumIcon,
  type Icon,
  PaintBrushIcon,
  PolygonIcon,
  SphereIcon,
  WindIcon,
} from "@phosphor-icons/react";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { type CSSProperties, useMemo } from "react";

import { OVERLINE } from "@/components";
import type { BinRow } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { FieldRow } from "../../../classes/components/ClassCells";
import type { ComponentItem, ComponentLine, DriverItem } from "../utils/graphItems";
import { KIND_NAME, KIND_TONE } from "../utils/graphTones";
import { driverSummary, fieldAlias, itemSubtitle, itemTitle } from "../utils/nodeText";
import { outputTop } from "../utils/outputSocket";
import { FIELD_PAD, FieldBody, Line, NAME_COLUMN, useRowsAt } from "./FieldLines";
import { type ComponentFlowNode, NodeHeader, Output, SOCKET, socketFill } from "./GraphNodes";
import { NodeFrame } from "./NodeFrame";
import { EmbeddedDriver } from "./SocketEmbed";

/** The glyph of each component slot, so a column of components reads by what each one does. */
const SLOT_ICON: readonly [prefix: string, icon: Icon][] = [
  ["Lifetime", HourglassMediumIcon],
  ["Physics", WindIcon],
  ["Render", PaintBrushIcon],
  ["Geometry", PolygonIcon],
];

/** The indent of one struct level, the inspector's own. */
const INDENT = 12;

/**
 * One shimmer component as a small inspector: each struct it holds heads a section, each
 * field edits in place, and each dynamic property is an input where it sits, with its driver
 * summarized. Decision 2.8 of docs/plans/shimmer-driver-graph.md.
 */
export function ComponentNodeView({ data, selected }: NodeProps<ComponentFlowNode>) {
  const { item, width, height } = data.placed;
  const runs = useMemo(() => runsOf(item.lines), [item.lines]);
  const embeds = useMemo(() => embedsOf(item), [item]);

  return (
    <NodeFrame width={width} height={height} selected={selected} item={item}>
      <NodeHeader
        icon={slotIcon(item)}
        iconTone="text-bin-class-text"
        title={itemTitle(item)}
        subtitle={itemSubtitle(item)}
        id={item.id}
        wire={item.wire}
        inputs={item.ports.length}
        divided={item.lines.length > 0}
      />
      {runs.length > 0 && (
        <div className={FIELD_PAD}>
          {runs.map((run, index) => (
            <RunLines key={index} run={run} embeds={embeds} />
          ))}
        </div>
      )}
      <Output kind={null} top={outputTop(item)} />
    </NodeFrame>
  );
}

/** The drivers embedded in the node's sockets, by port. */
type Embeds = ReadonlyMap<string, DriverItem>;

function embedsOf(item: ComponentItem): Embeds {
  return new Map(
    item.ports.flatMap((port) =>
      port.embed?.type === "driver" ? [[port.id, port.embed] as const] : [],
    ),
  );
}

function slotIcon(item: ComponentItem): Icon {
  return SLOT_ICON.find(([prefix]) => item.slot.startsWith(prefix))?.[1] ?? CubeIcon;
}

type SectionLineOf = Extract<ComponentLine, { type: "section" }>;
type HeldLine = Exclude<ComponentLine, SectionLineOf>;

type Run =
  | { readonly type: "section"; readonly line: SectionLineOf }
  | {
      readonly type: "fields";
      readonly holder: string;
      readonly holderRows: number;
      readonly lines: HeldLine[];
    };

/** The lines split into section headings and runs of lines one struct holds. */
function runsOf(lines: readonly ComponentLine[]): Run[] {
  const runs: Run[] = [];
  for (const line of lines) {
    if (line.type === "section") {
      runs.push({ type: "section", line });
      continue;
    }

    const last = runs.at(-1);
    if (last?.type === "fields" && last.holder === line.holder) {
      last.lines.push(line);
      continue;
    }
    runs.push({ type: "fields", holder: line.holder, holderRows: line.holderRows, lines: [line] });
  }
  return runs;
}

function RunLines({ run, embeds }: { run: Run; embeds: Embeds }) {
  if (run.type === "section") return <SectionLine line={run.line} />;
  return <FieldRun run={run} embeds={embeds} />;
}

/** The levels a line indents: a top-level section's own lines sit flush under its title. */
function shownDepth(depth: number): number {
  return Math.max(0, depth - 1);
}

function indent(depth: number): CSSProperties {
  return { paddingLeft: shownDepth(depth) * INDENT };
}

/**
 * A struct's heading. One the component holds reads as the inspector's section title, and a
 * deeper one or a list item as its field with its class beside it.
 */
function SectionLine({ line }: { line: SectionLineOf }) {
  const name = fieldAlias(line.name, line.hash);
  const place = line.index === null ? "" : ` [${line.index}]`;

  if (line.depth === 0 && line.index === null) {
    return (
      <Line className="border-t border-surface-700/40 first:border-t-0">
        <span className={twMerge(OVERLINE, "truncate px-2 font-sans")}>{name}</span>
      </Line>
    );
  }

  return (
    <Line className="gap-2 pr-2">
      <span className="flex min-w-0 items-center gap-2 pl-2" style={indent(line.depth)}>
        <span className="shrink-0 text-surface-300">{`${name}${place}`}</span>
        {line.className !== null && (
          <span className="min-w-0 truncate text-meta text-bin-class-text">{line.className}</span>
        )}
      </span>
    </Line>
  );
}

/** The lines of one struct: its fields from the rows read at it, and its inputs. */
function FieldRun({ run, embeds }: { run: Extract<Run, { type: "fields" }>; embeds: Embeds }) {
  const reads = run.lines.some((line) => line.type === "field");
  const rows = useRowsAt(run.holder, reads ? run.holderRows : 0);
  const shown = useMemo(() => (rows === null ? [] : [...rows.values()]), [rows]);

  return (
    <FieldBody wire={run.holder} rows={shown}>
      {run.lines.map((line) => (
        <RunLine
          key={line.type === "field" ? line.hash : line.port}
          line={line}
          rows={rows}
          embeds={embeds}
        />
      ))}
    </FieldBody>
  );
}

function RunLine({
  line,
  rows,
  embeds,
}: {
  line: HeldLine;
  rows: ReadonlyMap<string, BinRow> | null;
  embeds: Embeds;
}) {
  if (line.type === "input") return <InputLine line={line} embed={embeds.get(line.port)} />;
  if (line.type === "material") return <MaterialLine line={line} />;
  return <HeldField line={line} rows={rows} />;
}

/** A material the component draws with: the input its material node lands on, and its class. */
function MaterialLine({ line }: { line: Extract<ComponentLine, { type: "material" }> }) {
  return (
    <Line className="gap-2 pr-2">
      <Handle
        type="target"
        position={Position.Left}
        id={line.port}
        isConnectable={false}
        isConnectableStart={false}
        isConnectableEnd={false}
        className={twMerge(SOCKET, socketFill(null))}
      />
      <span
        className={twMerge(NAME_COLUMN, "ml-5.5 shrink-0 truncate text-surface-100")}
        style={indent(line.depth)}
      >
        {fieldAlias(line.name, line.hash)}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5 border-l border-surface-700/40 pl-2 text-meta text-bin-class-text">
        <SphereIcon weight="duotone" className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">{line.className}</span>
      </span>
    </Line>
  );
}

function HeldField({
  line,
  rows,
}: {
  line: Extract<ComponentLine, { type: "field" }>;
  rows: ReadonlyMap<string, BinRow> | null;
}) {
  const row = rows?.get(`${line.holder}.${line.hash.slice(2)}`);
  const label = fieldAlias(line.name, line.hash);

  if (row === undefined) {
    return (
      <Line>
        <span
          className={twMerge(NAME_COLUMN, "ml-5.5 shrink-0 truncate text-surface-500")}
          style={indent(line.depth)}
        >
          {label}
        </span>
      </Line>
    );
  }

  return (
    <Line menu={{ row, owner: null }}>
      <div className="min-w-0 flex-1 overflow-hidden">
        <FieldRow
          row={row}
          label={label}
          tableLayout
          width={NAME_COLUMN}
          owner={null}
          depth={shownDepth(line.depth)}
        />
      </div>
    </Line>
  );
}

/**
 * A dynamic property: the input its graph lands on, its name, and its driver in brief, or the
 * driver itself where it is embedded in the socket.
 */
function InputLine({
  line,
  embed,
}: {
  line: Extract<ComponentLine, { type: "input" }>;
  embed: DriverItem | undefined;
}) {
  const label = line.hash === null ? line.name : fieldAlias(line.name, line.hash);
  const { value, role } = driverSummary(line.driver);

  return (
    <Line className="gap-2 pr-2">
      <Handle
        type="target"
        position={Position.Left}
        id={line.port}
        isConnectable={false}
        isConnectableStart={false}
        isConnectableEnd={false}
        className={twMerge(SOCKET, socketFill(line.kind))}
      />
      <span
        className={twMerge(NAME_COLUMN, "ml-5.5 shrink-0 truncate text-surface-100")}
        style={indent(line.depth)}
      >
        {label}
      </span>
      {embed !== undefined && (
        <span className="flex min-w-0 flex-1 border-l border-surface-700/40 pl-1">
          <EmbeddedDriver item={embed} />
        </span>
      )}
      {embed === undefined && (
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5 border-l border-surface-700/40 pl-2 text-meta">
          {value !== null && <span className="min-w-0 truncate text-surface-200">{value}</span>}
          <span className="shrink-0 truncate text-surface-400">{role}</span>
        </span>
      )}
      <span className={twMerge("shrink-0 text-meta", KIND_TONE[line.kind].text)}>
        {KIND_NAME[line.kind]}
      </span>
    </Line>
  );
}
