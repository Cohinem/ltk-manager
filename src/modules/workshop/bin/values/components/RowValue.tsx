import {
  CaretDownIcon,
  CaretRightIcon,
  PencilSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  use,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ChannelSash,
  Checkbox,
  Code,
  FieldDiscardContext,
  Readout,
  Select,
  Tooltip,
  InputDefaultContext,
} from "@/components";
import { errorSummary, m } from "@/i18n";
import type { AppError, BinRow, BinValue, RowNode } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { ClassCard } from "../../classes/components/ClassCard";
import { FileChip, ObjectChip, StringValue } from "../../links/components/LinkChip";
import { ObjectNameContext } from "../../links/hooks/useLinkTargets";
import { PathInput } from "../../paths/components/PathInput";
import { type PathField, pathFieldOf } from "../../paths/utils/pathField";
import { useRowEdit } from "../../tree/hooks/useBinEdit";
import { type LeafEdit, LeafEditContext } from "../../tree/hooks/useLeafEdit";
import { fieldHash, recordField, rowKey } from "../../tree/utils/binRows";
import {
  boolLeaf,
  floatLeaf,
  hashedLeaf,
  integerLeaf,
  colorChannelsLeaf,
  matrixLeaf,
  stringLeaf,
  vectorLeaf,
  vectorValuesLeaf,
} from "../../tree/utils/leafText";
import { useValueMark } from "../hooks/useValueMarks";
import { enumReading, enumText, type FieldEnum, fieldEnum } from "../utils/fieldEnums";
import { type FieldUnit, fieldUnit, UNIT_SUFFIX } from "../utils/fieldUnits";
import {
  channels,
  colorStops,
  markRanges,
  markValue,
  type ValueMark,
  type ValueRange,
} from "../utils/valueRows";
import { ColorField, isColorVector } from "./ColorField";
import { ColorMark } from "./ColorMark";
import { FlagsSelect } from "./FlagsSelect";

const AXES = ["x", "y", "z", "w"] as const;
/** The room a number on its own takes, so a column of rows lines its digits up. */
const SCALAR_WIDTH = "w-[var(--bin-scalar-width,8rem)]";
/** One component of a vector or a matrix, which holds a float. */
const COMPONENT_WIDTH = "w-[var(--bin-component-width,6rem)]";
/** What stands between a random range's bounds, "The inspector" in docs/ux/BIN_EDITOR.md. */
const RANGE_SEPARATOR = "..";

/**
 * The cell a row's value draws, which is what a class view places where its layout
 * names no widget of its own.
 */
export function RowValue({
  row,
  field = ownField(row),
  color = false,
  className,
}: {
  row: BinRow;
  field?: string | null;
  /** The row is a colour whatever its name, such as a colour value's constant. */
  color?: boolean;
  /** Overrides the cell's own classes, such as the width it takes in its line. */
  className?: string;
}) {
  const objectName = use(ObjectNameContext);
  const key = rowKey(row);
  const { edit: treeEdit } = useRowEdit(key);
  const leafEdit = use(LeafEditContext);
  const edit = treeEdit ?? leafEdit;
  const refusal = edit?.refused.get(key);
  const focused = treeEdit !== null && treeEdit.focusKey === key;
  const widget =
    edit === null
      ? null
      : leafField(row, edit, {
          field,
          invalid: refusal !== undefined,
          object: objectName(row.entry),
          autoFocus: focused,
          onEnter: () => treeEdit?.enter(key),
          color,
        });

  if (widget !== null) {
    return (
      /* `group/row` again, so a layout cell outside a row shows its hover actions too. */
      <span
        data-row-value
        className={twMerge("group/row flex min-w-0 flex-1 items-center gap-2", className)}
      >
        <FieldDiscardContext value={() => edit?.dismiss?.(key)}>{widget}</FieldDiscardContext>
        {refusal !== undefined && <RefusalMark refusal={refusal} />}
      </span>
    );
  }

  if (row.value.type === "vector" && (color || isColorVector(row.name, row.value.values))) {
    return (
      <span className={twMerge("flex min-w-0 flex-1 items-center gap-2", className)}>
        <ColorField values={row.value.values} label={m.workshop_bin_color_edit_action()} />
      </span>
    );
  }

  return (
    <span className={twMerge("flex min-w-0 flex-1 items-center gap-2", className)}>
      <Value
        value={row.value}
        node={row.node}
        rowKey={rowKey(row)}
        field={field}
        object={objectName(row.entry)}
      />
    </span>
  );
}

/** Why the last value a field sent was refused, beside the field. */
export function RefusalMark({ refusal }: { refusal: AppError }) {
  const reason = errorSummary(refusal);
  return (
    <Tooltip content={reason}>
      <WarningCircleIcon aria-label={reason} className="size-3.5 shrink-0 text-danger-text" />
    </Tooltip>
  );
}

interface LeafDrawing {
  field: string | null;
  /** The last value the row sent was refused. */
  invalid: boolean;
  /** The path of the object the row sits in. */
  object: string;
  /** Focus the field as it draws, for a value just added. */
  autoFocus: boolean;
  /** A bare `Enter` left the field. */
  onEnter: () => void;
  /** The row is a colour whatever its name. */
  color: boolean;
}

/**
 * The widget a leaf takes an edit in, or null for a value an edit does not reach here.
 *
 * "Leaf editing" in docs/ux/BIN_EDITOR.md. A plain function rather than a component, so
 * the caller falls back to the read-only value on null.
 */
function leafField(row: BinRow, edit: LeafEdit, drawn: LeafDrawing): ReactNode | null {
  const { field, invalid, object, autoFocus, onEnter, color } = drawn;
  const { value } = row;
  switch (value.type) {
    case "bool":
      return (
        <Checkbox
          size="sm"
          checked={value.value}
          onCheckedChange={(checked) => edit.commit(row, boolLeaf(checked))}
        />
      );
    case "integer": {
      const held = field === null ? null : fieldEnum(field);
      if (held !== null && !held.flags) {
        return (
          <EnumSelect
            held={held}
            text={value.text}
            onChange={(text) => {
              void edit.commit(row, integerLeaf(text, row.kind));
              onEnter();
            }}
          />
        );
      }
      if (held !== null) {
        return (
          <FlagsSelect
            held={held}
            text={value.text}
            onChange={(text) => void edit.commit(row, integerLeaf(text, row.kind))}
          />
        );
      }
      const reading = enumReading(field, value.text);
      return (
        <span className="flex min-w-0 items-center gap-1.5">
          <NumberValue
            text={value.text}
            step="integer"
            field={field}
            invalid={invalid}
            autoFocus={autoFocus}
            onEnter={onEnter}
            onCommit={(text) => edit.commit(row, integerLeaf(text, row.kind))}
          />
          {reading !== null && <Dim>{reading}</Dim>}
        </span>
      );
    }
    case "float":
      return (
        <NumberValue
          text={String(value.value)}
          field={field}
          invalid={invalid}
          autoFocus={autoFocus}
          onEnter={onEnter}
          onCommit={(text) => edit.commit(row, floatLeaf(text))}
        />
      );
    case "vector":
      if (color || isColorVector(row.name, value.values)) {
        return (
          <ColorField
            values={value.values}
            label={m.workshop_bin_color_edit_action()}
            onCommit={(next) => void edit.commit(row, vectorValuesLeaf(next))}
          />
        );
      }
      return (
        <Components
          labels={AXES}
          values={value.values}
          width={COMPONENT_WIDTH}
          invalid={invalid}
          autoFocus={autoFocus}
          onEnter={onEnter}
          onCommit={(at, text) => edit.commit(row, vectorLeaf(value.values, at, text))}
        />
      );
    case "color":
      return (
        <ColorValue
          value={value}
          onPick={(next) => void edit.commit(row, colorChannelsLeaf(next))}
        />
      );
    case "matrix":
      return (
        <MatrixValue
          values={value.values}
          invalid={invalid}
          onCommit={(at, text) => edit.commit(row, matrixLeaf(value.values, at, text))}
        />
      );
    case "string":
      return (
        <TextEdit
          text={value.value}
          path={pathFieldOf(row)}
          invalid={invalid}
          autoFocus={autoFocus}
          onEnter={onEnter}
          onCommit={(text) => edit.commit(row, stringLeaf(text))}
        >
          <StringValue text={value.value} />
        </TextEdit>
      );
    case "hash":
    case "objectLink":
      return (
        <TextEdit
          text={value.name ?? value.hash}
          invalid={invalid}
          autoFocus={autoFocus}
          onEnter={onEnter}
          onCommit={(text) => edit.commit(row, hashedLeaf(value.type, text))}
        >
          <ObjectChip
            hash={value.hash}
            name={value.name}
            kind={value.type === "hash" ? "hash" : "link"}
            base={object}
            classMark="after"
          />
        </TextEdit>
      );
    case "wadChunkLink":
      return (
        <TextEdit
          text={value.path ?? value.hash}
          path={pathFieldOf(row)}
          invalid={invalid}
          autoFocus={autoFocus}
          onEnter={onEnter}
          onCommit={(text) => edit.commit(row, hashedLeaf("wadChunkLink", text))}
        >
          <FileChip hash={value.hash} path={value.path} />
        </TextEdit>
      );
    default:
      return null;
  }
}

interface TextEditProps {
  /** The text the field opens holding: the string, the name, or the hex. */
  text: string;
  /** What the edit action is called. The value's edit where absent. */
  label?: string;
  /** The path field settings, for a field that suggests files. Null for a plain text field. */
  path?: PathField | null;
  invalid: boolean;
  /** Open the field as the row draws, for a property just added. */
  autoFocus: boolean;
  onEnter?: () => void;
  /** Send the typed text. A promise answers whether it landed, and a refusal keeps the field open. */
  onCommit: (text: string) => void | Promise<boolean>;
  /** What the row draws while no edit is open. */
  children: ReactNode;
}

/**
 * A value drawn as its chip or its text, opening to a field on the row's edit action.
 *
 * The chip stays what a reader reads and clicks, so a string naming a file still opens
 * it. The field is for the change, and it stays open with the typed text while a send
 * is answered and after a refusal, until `Escape` drops it. A focus request opens it.
 */
export function TextEdit({
  text,
  label = m.workshop_bin_edit_value_action(),
  path = null,
  invalid,
  autoFocus,
  onEnter,
  onCommit,
  children,
}: TextEditProps) {
  const implicit = use(InputDefaultContext);
  const discard = use(FieldDiscardContext);
  const [editing, setEditing] = useState(autoFocus);
  const [asked, setAsked] = useState(autoFocus);
  if (autoFocus !== asked) {
    setAsked(autoFocus);
    if (autoFocus) setEditing(true);
  }

  const sending = useRef(false);
  function commit(typed: string) {
    const sent = onCommit(typed);
    if (!(sent instanceof Promise)) return;

    sending.current = true;
    void sent.then((landed) => {
      sending.current = false;
      if (landed) setEditing(false);
    });
  }
  function leave() {
    if (!sending.current && !invalid) setEditing(false);
  }
  const dropped = useMemo(
    () => () => {
      discard?.();
      setEditing(false);
    },
    [discard],
  );

  if ((editing || implicit) && path !== null) {
    return (
      <FieldDiscardContext value={dropped}>
        <span data-text-field className="flex min-w-0 flex-1">
          <PathInput
            value={text}
            field={path}
            placeholder={text || m.workshop_bin_empty_label()}
            aria-label={label}
            invalid={invalid}
            autoFocus={editing}
            onEnter={onEnter}
            onCommit={commit}
            onLeave={leave}
          />
        </span>
      </FieldDiscardContext>
    );
  }
  if (editing || implicit) {
    return (
      <FieldDiscardContext value={dropped}>
        <span data-text-field className="flex min-w-0 flex-1">
          <Readout
            value={text}
            placeholder={text || m.workshop_bin_empty_label()}
            aria-label={label}
            className="min-w-0 flex-1"
            invalid={invalid}
            autoFocus={editing}
            onEnter={onEnter}
            onCommit={commit}
            onLeave={leave}
          />
        </span>
      </FieldDiscardContext>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {children}
      <Tooltip content={label}>
        <button
          type="button"
          aria-label={label}
          data-edit-value
          /* DS-VEIL, DS-RADIUS */
          className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-surface-400 opacity-0 group-hover/row:opacity-100 hover:bg-surface-veil hover:text-surface-200 focus-visible:opacity-100"
          onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            setEditing(true);
          }}
        >
          <PencilSimpleIcon weight="bold" className="size-3.5" />
        </button>
      </Tooltip>
    </span>
  );
}

interface EnumSelectProps {
  held: FieldEnum;
  /** The number the file holds, as text. */
  text: string;
  onChange: (text: string) => void;
}

/** An enum as a select of the engine's words, the number the file holds beside it. */
function EnumSelect({ held, text, onChange }: EnumSelectProps) {
  const implicit = use(InputDefaultContext);
  const options = Object.values(held.names).map((value) => String(value));
  if (!options.includes(text)) options.unshift(text);
  const labelOf = (option: string) => enumText(held, Number(option)) ?? option;

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Select.Root
        value={implicit ? null : text}
        onValueChange={(next) => next !== null && (implicit || next !== text) && onChange(next)}
      >
        <Select.Trigger
          /* DS-VEIL, DS-RADIUS */
          className={twMerge(
            "h-auto w-auto min-w-0 gap-1 rounded-sm border-surface-veil bg-surface-veil-soft px-1.5 py-0.5 text-mono-row text-surface-200",
            implicit && "border-dashed bg-transparent text-surface-400",
          )}
          onClick={(event: ReactMouseEvent<HTMLButtonElement>) => event.stopPropagation()}
        >
          <Select.Value>{(current: string | null) => labelOf(current ?? text)}</Select.Value>
          <CaretDownIcon weight="bold" className="size-3 shrink-0 text-surface-400" />
        </Select.Trigger>
        <Select.Content>
          {options.map((option) => (
            <Select.Item key={option} value={option}>
              {labelOf(option)}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
      {/* DS-CODE-CHIP */}
      <Code
        className={twMerge("shrink-0 select-text", implicit && "bg-transparent text-surface-400")}
      >
        {text}
      </Code>
    </span>
  );
}

/**
 * The field hash a row's own tables are keyed on, and null for a row that is no property.
 *
 * A patch record counts as the property its path ends in.
 */
export function ownField(row: BinRow): string | null {
  if (row.node === "property") return fieldHash(row.path);
  if (row.node === "record") return recordField(row.name);
  return null;
}

interface ValueProps {
  value: BinValue;
  /** Where the row sits, which decides what the name cell already drew. */
  node: RowNode;
  /** The row's own key, which a value the projected read answers for reads its mark under. */
  rowKey: string;
  /** The field the value sits under, which its enum and its unit are keyed on. */
  field: string | null;
  /** The path of the object the row sits in, which a link's path reads under. */
  object: string;
}

function Value({ value, node, rowKey: key, field, object }: ValueProps) {
  switch (value.type) {
    case "none":
      return <Dim>{m.workshop_bin_none_label()}</Dim>;
    case "bool":
      return <Checkbox size="sm" checked={value.value} readOnly tabIndex={-1} />;
    case "integer":
      return <IntegerValue text={value.text} field={field} />;
    case "float":
      return <NumberValue text={String(value.value)} field={field} />;
    case "vector":
      return <Components labels={AXES} values={value.values} width={COMPONENT_WIDTH} />;
    case "matrix":
      return <MatrixValue values={value.values} />;
    case "color":
      return <ColorValue value={value} />;
    case "string":
      return <StringValue text={value.value} />;
    case "hash":
    case "objectLink":
      return (
        <ObjectChip
          hash={value.hash}
          name={value.name}
          kind={value.type === "hash" ? "hash" : "link"}
          base={object}
          classMark="after"
        />
      );
    case "wadChunkLink":
      return <FileChip hash={value.hash} path={value.path} />;
    case "container":
      if (value.len === 0) return <Dim>{m.workshop_bin_empty_label()}</Dim>;
      return <Dim>{m.workshop_bin_items_label({ count: value.len })}</Dim>;
    case "map":
      if (value.len === 0) return <Dim>{m.workshop_bin_empty_label()}</Dim>;
      return <Dim>{m.workshop_bin_entries_label({ count: value.len })}</Dim>;
    case "struct":
      return <StructValue value={value} node={node} rowKey={key} />;
    case "null":
      return <Dim>{m.workshop_bin_null_label()}</Dim>;
    case "optional":
      if (value.present) return <Dim>{m.workshop_bin_present_label()}</Dim>;
      return <Dim>{m.workshop_bin_absent_label()}</Dim>;
    case "undrawn":
      return <Dim>{m.workshop_bin_undrawn_label()}</Dim>;
    case "records":
      return <span className="ml-auto text-meta text-surface-400">{value.len}</span>;
  }
}

/** An integer, drawn as the engine's own word for it wherever a table holds one. */
function IntegerValue({ text, field }: { text: string; field: string | null }) {
  const reading = enumReading(field, text);
  if (reading === null) return <NumberValue text={text} field={field} />;
  return <EnumValue reading={reading} raw={text} />;
}

interface NumberValueProps {
  step?: number | "integer";
  text: string;
  field: string | null;
  invalid?: boolean;
  /** Focus the box as it draws. */
  autoFocus?: boolean;
  /** A bare `Enter` left the box. */
  onEnter?: () => void;
  /** Take an edit. Absent, the box is read-only. */
  onCommit?: (text: string) => void;
}

/** A number in the box it is edited in, and the unit its field is measured in after it. */
function NumberValue({
  text,
  field,
  invalid,
  autoFocus,
  onEnter,
  onCommit,
  step = 1,
}: NumberValueProps) {
  const unit = fieldUnit(field);
  const box = (
    <Readout
      value={text}
      step={step}
      className={SCALAR_WIDTH}
      invalid={invalid}
      autoFocus={autoFocus}
      onEnter={onEnter}
      onCommit={onCommit}
    />
  );
  if (unit === null) return box;
  return (
    <span className="flex min-w-0 items-center gap-1">
      {box}
      <Unit unit={unit} />
    </span>
  );
}

/** A random range as the two boxes an edit sets, and the unit after them. */
function RangeValue({ range, field }: { range: ValueRange; field: string | null }) {
  const unit = fieldUnit(field);
  if (range.least === range.most) return <NumberValue text={String(range.least)} field={field} />;
  return (
    <span className="flex min-w-0 items-center gap-1">
      <Readout value={String(range.least)} className={twMerge(COMPONENT_WIDTH, "text-right")} />
      <span className="shrink-0 text-surface-400 select-none">{RANGE_SEPARATOR}</span>
      <Readout value={String(range.most)} className={twMerge(COMPONENT_WIDTH, "text-right")} />
      {unit !== null && <Unit unit={unit} />}
    </span>
  );
}

/** One range as the text of a cell too narrow for two boxes. */
function rangeText(range: ValueRange): string {
  if (range.least === range.most) return String(range.least);
  return `${range.least} ${RANGE_SEPARATOR} ${range.most}`;
}

/** What a number is measured in. "The inspector" in docs/ux/BIN_EDITOR.md. */
function Unit({ unit }: { unit: FieldUnit }) {
  return <span className="shrink-0 text-surface-400 select-none">{UNIT_SUFFIX[unit]()}</span>;
}

/** An enum in the box a leaf edit turns into a select, the number the file holds beside it. */
function EnumValue({ reading, raw }: { reading: string; raw: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        /* DS-VEIL, DS-RADIUS */
        className="flex min-w-0 items-center gap-1 rounded-sm border border-surface-veil bg-surface-veil-soft px-1.5 py-0.5 text-surface-200"
      >
        <span className="min-w-0 truncate select-text">{reading}</span>
        <CaretDownIcon weight="bold" className="size-3 shrink-0 text-surface-400" />
      </span>
      {/* DS-CODE-CHIP */}
      <Code className="shrink-0 select-text">{raw}</Code>
    </span>
  );
}

/**
 * A vector down columns of one width, each axis headed by its channel's sash.
 *
 * "The inspector" in docs/ux/BIN_EDITOR.md. A component past the third wraps to a second
 * line of the same three columns, so one column holds one axis down the whole pane. An
 * axis a table widens reads its range.
 */
export function AxisCells({
  values,
  ranges,
}: {
  values: readonly (number | null)[];
  ranges?: readonly (ValueRange | null)[];
}) {
  return (
    <span className="grid min-w-0 flex-1 grid-cols-3 gap-1">
      {values.map((component, at) => (
        <span
          key={AXES[at] ?? at}
          /* DS-VEIL, DS-RADIUS */
          className="flex min-w-0 items-stretch overflow-hidden rounded-sm border border-surface-veil"
        >
          <ChannelSash channel={at} />
          <span
            aria-label={AXES[at]}
            className="min-w-0 flex-1 truncate bg-surface-veil-soft px-1.5 py-0.5 text-right font-mono text-surface-200 tabular-nums select-text"
          >
            {axisText(component, ranges?.[at])}
          </span>
        </span>
      ))}
    </span>
  );
}

/** One axis as its cell reads it: the range a table widens it to, else its value. */
function axisText(component: number | null, range: ValueRange | null | undefined): string {
  if (range == null) return String(component);
  return rangeText(range);
}

interface StructValueProps {
  value: Extract<BinValue, { type: "struct" }>;
  node: RowNode;
  rowKey: string;
}

function StructValue({ value, node, rowKey: key }: StructValueProps) {
  const mark = useValueMark(key);

  /* An element names its class beside its index, so the value column would write it twice. */
  if (node === "element") return <ValueMarkCell mark={mark} />;

  return (
    <>
      <ClassCard classHash={value.classHash} name={value.class} />
      <ValueMarkCell mark={mark} />
      {node === "object" && <PropertyCount count={value.len} />}
    </>
  );
}

/** How many properties an object holds, beside its class. */
function PropertyCount({ count }: { count: number }) {
  return (
    <Tooltip content={m.workshop_bin_object_property_count_label({ count })}>
      <span className="flex shrink-0 items-center gap-1.5 text-meta text-surface-400">
        <span aria-hidden>·</span>
        {count}
      </span>
    </Tooltip>
  );
}

/**
 * The constant a value-family row draws beside its class, once the read lands.
 *
 * "A value family on its row" in docs/ux/BIN_EDITOR.md. Nothing until it lands, which
 * keeps the row one line rather than a placeholder that shifts.
 */
export function ValueMarkCell({
  mark,
  axes = false,
  field = null,
}: {
  mark: ValueMark | undefined;
  /** A vector constant takes the inspector's tinted columns rather than a run of readouts. */
  axes?: boolean;
  /** The field the family sits under, whose unit a scalar constant carries. */
  field?: string | null;
}) {
  if (mark === undefined) return null;
  /* A colour that animates is drawn by its stops, which a file writing no constant still has. */
  if (mark.family === "color") {
    const rgba = channels(mark.constant);
    const stops = colorStops(mark.keys);
    if (rgba === null && stops.length === 0) return null;
    return <ColorMark constant={rgba} stops={stops} wide={axes} />;
  }
  const ranges = markRanges(mark);
  const [range] = ranges ?? [];
  if (mark.family === "scalar" && range != null) return <RangeValue range={range} field={field} />;

  const value = markValue(mark);
  if (value == null) return null;
  if (value.type === "float") {
    return <NumberValue text={String(value.value)} field={field} />;
  }
  if (value.type === "vector") {
    if (axes) return <AxisCells values={value.values} ranges={ranges ?? undefined} />;
    return <Components labels={AXES} values={value.values} width={COMPONENT_WIDTH} />;
  }
  return null;
}

interface ComponentsProps {
  labels: readonly string[];
  /** A component is `null` for a float JSON cannot carry: a NaN or an infinity. */
  values: readonly (number | null)[];
  /** The room one readout takes, so a column of rows lines up. */
  width: string;
  invalid?: boolean;
  /** Focus the first box as it draws. */
  autoFocus?: boolean;
  /** A bare `Enter` left a box. */
  onEnter?: () => void;
  /** Take an edit to the component at `at`. Absent, the boxes are read-only. */
  onCommit?: (at: number, text: string) => void;
}

function Components({
  labels,
  values,
  width,
  invalid,
  autoFocus,
  onEnter,
  onCommit,
}: ComponentsProps) {
  return (
    <span className="flex min-w-0 gap-1.5">
      {values.map((component, at) => (
        <Readout
          key={labels[at] ?? at}
          value={String(component)}
          step={1}
          label={labels[at]}
          channel={at}
          className={width}
          invalid={invalid}
          autoFocus={autoFocus === true && at === 0}
          onEnter={onEnter}
          onCommit={onCommit && ((text) => onCommit(at, text))}
        />
      ))}
    </span>
  );
}

interface MatrixValueProps {
  values: readonly (number | null)[];
  invalid?: boolean;
  /** Take an edit to the cell at `at`, row-major. Absent, the cells are read-only. */
  onCommit?: (at: number, text: string) => void;
}

/** Sixteen cells, shut until asked for. A shut matrix is one line like every other row. */
function MatrixValue({ values, invalid, onCommit }: MatrixValueProps) {
  const [open, setOpen] = useState(false);
  const label = m.workshop_bin_matrix_label();

  function toggle(event: ReactMouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setOpen((shown) => !shown);
  }

  if (!open) {
    return (
      <button
        type="button"
        className="flex cursor-pointer items-center gap-1 text-surface-400 hover:text-surface-200"
        onClick={toggle}
      >
        <CaretRightIcon weight="bold" className="size-3" />
        <span>{label}</span>
      </button>
    );
  }

  /* A cell is a control of its own, which nothing may nest inside a button. */
  return (
    <span className="my-1 flex items-start gap-1">
      <button
        type="button"
        aria-label={label}
        className="mt-1 flex h-4 w-3 shrink-0 cursor-pointer items-center justify-center text-surface-400 hover:text-surface-200"
        onClick={toggle}
      >
        <CaretRightIcon weight="bold" className="size-3 rotate-90" />
      </button>
      <span className="grid grid-cols-4 gap-x-1 gap-y-0.5">
        {values.map((cell, at) => (
          <Readout
            key={at}
            value={String(cell)}
            step={0.1}
            className={COMPONENT_WIDTH}
            invalid={invalid}
            onCommit={onCommit && ((text) => onCommit(at, text))}
          />
        ))}
      </span>
    </span>
  );
}

interface ColorValueProps {
  value: Extract<BinValue, { type: "color" }>;
  /** Take every channel from the picker, each 1 at full. Absent, the swatch only reads. */
  onPick?: (channels: number[]) => void;
}

function ColorValue({ value, onPick }: ColorValueProps) {
  const { r, g, b, a } = value;
  return (
    <ColorField
      className="max-w-32 flex-none"
      values={[r / 255, g / 255, b / 255, a / 255]}
      label={m.workshop_bin_color_edit_action()}
      onCommit={onPick}
    />
  );
}

function Dim({ children }: { children: ReactNode }) {
  return <span className="text-surface-400">{children}</span>;
}
