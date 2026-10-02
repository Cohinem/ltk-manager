import {
  ArrowSquareOutIcon,
  CaretRightIcon,
  type Icon,
  SpinnerGapIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  use,
  useEffect,
  useMemo,
  useRef,
} from "react";

import { IconButton, FieldDiscardContext, SeverityGlyph, Tooltip } from "@/components";
import { errorSummary, m } from "@/i18n";
import type { AppError, BinRow } from "@/lib/tauri";
import { twMerge } from "@/utils";

import type { OpenIntent } from "../../../palette/utils/types";
import { ObjectGlyph } from "../../../shared/components/ObjectGlyph";
import { useGuideLevels } from "../../../shared/state/treeGuides";
import { clickIntent } from "../../../state";
import { ClassCard } from "../../classes/components/ClassCard";
import { DeclaredLine, FieldCard } from "../../classes/components/FieldCard";
import { ChangeMark } from "../../documents/components/ChangeMark";
import {
  DeclaredDiagnosticsMark,
  DeclaredRowMark,
  ObjectChangeMark,
} from "../../documents/components/DeclaredLayer";
import { OverrideRowMark } from "../../documents/components/OverrideMark";
import {
  useDeclaredMark,
  useDeclaredObject,
  useDeclares,
  useRowDiagnostics,
} from "../../documents/hooks/useDeclared";
import { useRowOverrides } from "../../documents/hooks/useOverrides";
import { useObjectOpen } from "../../links/hooks/useLinkTargets";
import { CutText } from "../../shared/components/CutText";
import { RefusalMark, RowValue, TextEdit } from "../../values/components/RowValue";
import { rowTag } from "../../values/utils/kindTag";
import { BinEditContext, useRowEdit } from "../hooks/useBinEdit";
import { keyMark } from "../hooks/useLeafEdit";
import { typedKey } from "../utils/addItem";
import {
  canExpand,
  fieldHash,
  guideBlocks,
  INDENT,
  lineParent,
  MAX_INDENT_DEPTH,
  outsideColumn,
  repeatsKey,
  type RowLine,
  type VisibleRow,
} from "../utils/binRows";
import {
  EDIT_ICON,
  editLabel,
  keyEdit,
  onHover,
  type RowEdit,
  rowEdits,
  undeclarable,
} from "../utils/rowEdits";

/**
 * One line at zoom 100, which is what sizes the virtualizer. A matrix opened in place grows past it.
 *
 * `min-h-6` is six spacing units of 4.5px. An estimate off the drawn height moves every row
 * below a row as it measures.
 */
export const ROW_HEIGHT = 27;

/** A row's value as wide as it draws, so the hover actions follow it. An open text field fills the row. */
const HUG_VALUE = "flex-initial has-[[data-text-field]]:flex-1";

interface RowLineProps {
  line: RowLine;
  /** The reveal landed on this row. */
  focused: boolean;
  /** The fetch of the rows under this one failed. */
  error?: AppError;
  onToggle: (key: string) => void;
  /** Open the object an object row declares. Absent where no row is an object. */
  onOpenObject?: (row: BinRow, intent: OpenIntent) => void;
  /** The row is the tree's one tab stop. */
  tabStop?: boolean;
}

const NO_EDITS: readonly RowEdit[] = [];

/** Whether focus went nowhere, as it does when the edit field that had it closes. */
function focusDropped(): boolean {
  return document.activeElement === null || document.activeElement === document.body;
}

/** What focus lands on in a row an edit sent it to: the value's first control, else an action. */
const FOCUS_TARGET =
  "[data-row-value] input:not([readonly]), [data-row-value] button, [data-row-action]";

/**
 * One node of the bin: its name, its kind as a tag, and its value.
 *
 * The row takes focus for the tree's arrow keys, and gets it back when a field in it closes on
 * `Enter` or `Escape` with nowhere else to go.
 */
export function BinRowLine({
  line,
  focused,
  error,
  onToggle,
  onOpenObject,
  tabStop = false,
}: RowLineProps) {
  const { row, depth, expanded, loading } = line;
  const edit = use(BinEditContext);
  /* An object the chosen layer removes draws as its row alone: nothing under it, no edit. */
  const removed = useDeclaredObject(objectEntry(row))?.change === "removed";
  const expandable = !removed && canExpand(row, edit !== null);
  const declares = useDeclares();
  const edits = edit === null || removed ? NO_EDITS : rowEdits(line);
  const rowRef = useRef<HTMLDivElement>(null);
  const focusHere = edit !== null && edit.focusKey === line.key;

  /* A row drawn before the request keeps its fields mounted, so autoFocus alone misses it. */
  useEffect(() => {
    if (!focusHere) return;
    const drawn = rowRef.current;
    const active = document.activeElement;
    if (drawn !== null && (active === drawn || !drawn.contains(active))) {
      drawn.querySelector<HTMLElement>(FOCUS_TARGET)?.focus();
    }
    edit.settleFocus();
  }, [edit, focusHere]);

  function keys(event: ReactKeyboardEvent<HTMLDivElement>) {
    const drawn = rowRef.current;
    if ((event.key === "Enter" || event.key === "Escape") && event.target !== drawn) {
      requestAnimationFrame(() => {
        if (drawn?.isConnected && focusDropped()) drawn.focus();
      });
    }

    const asked = edit === null ? null : keyEdit(event, edits);
    if (asked === null) return;
    event.preventDefault();
    event.stopPropagation();
    edit?.run(line, asked);
  }

  return (
    <div
      ref={rowRef}
      data-ui="BinDocument:row"
      data-tree-row={line.key}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={expandable ? expanded : undefined}
      tabIndex={tabStop ? 0 : -1}
      className={twMerge(
        /* DS-VEIL, DS-RADIUS. No transition: a fade in and out under a pointer crossing
           a list of 24px rows reads as a flicker rather than as a highlight. */
        "group/row flex min-h-6 items-center gap-2 rounded-sm pr-2 text-mono-row outline-none hover:bg-surface-veil-soft focus-visible:bg-surface-veil",
        expandable && "cursor-pointer",
        focused && "bg-accent-500/15",
      )}
      onClick={() => expandable && onToggle(line.key)}
      onKeyDown={keys}
    >
      <NameCell line={line} expandable={expandable} expanded={expanded} loading={loading} />
      {row.value.type === "records" ? (
        <span className="shrink-0 text-meta text-surface-400">{row.value.len}</span>
      ) : (
        <RowValue row={row} className={HUG_VALUE} />
      )}
      {error && (
        <Tooltip content={errorSummary(error)}>
          <WarningCircleIcon className="size-3.5 shrink-0 text-warning-text" />
        </Tooltip>
      )}
      {edit !== null &&
        edits
          .filter(onHover)
          /* A refused edit states its reason in the menu, where a label has room. */
          .filter((kind) => !declares || undeclarable(kind, row) === null)
          .map((kind) => (
            <RowAction
              key={kind}
              label={editLabel(kind)}
              icon={EDIT_ICON[kind]}
              onAct={() => edit.run(line, kind)}
            />
          ))}
      {row.node === "object" && onOpenObject && !removed && (
        <OpenObjectAction onOpen={(intent) => onOpenObject(row, intent)} />
      )}
      {row.node === "target" && <OpenTargetAction hash={row.entry} />}
    </div>
  );
}

interface RowActionProps {
  label: string;
  icon: Icon;
  onAct: () => void;
}

/** A hover action of an editable row, which leaves the row's own click alone. */
export function RowAction({ label, icon: Glyph, onAct }: RowActionProps) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        data-row-action
        /* DS-VEIL, DS-RADIUS */
        className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-surface-400 opacity-0 group-hover/row:opacity-100 hover:bg-surface-veil hover:text-surface-200 focus-visible:opacity-100"
        onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
          event.stopPropagation();
          onAct();
        }}
      >
        <Glyph weight="bold" className="size-3.5" />
      </button>
    </Tooltip>
  );
}

/** The object row's hover action, opening its object tab. `Ctrl+click` opens it beside. */
function OpenObjectAction({ onOpen }: { onOpen: (intent: OpenIntent) => void }) {
  const label = m.workshop_bin_open_object_action();
  return (
    <IconButton
      size="row"
      label={label}
      icon={<ArrowSquareOutIcon />}
      className="shrink-0 text-surface-400 opacity-0 group-hover/row:opacity-100 hover:text-surface-200 focus-visible:opacity-100"
      onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onOpen(clickIntent(event));
      }}
    />
  );
}

/** A patch target row's hover action, opening the object the records patch where one declares it. */
function OpenTargetAction({ hash }: { hash: string }) {
  const open = useObjectOpen(hash);
  if (open === null) return null;
  return <OpenObjectAction onOpen={open} />;
}

interface MoreRowProps {
  line: Extract<VisibleRow, { kind: "more" }>;
}

/** The line under a node whose rows have not all answered. */
export function MoreRow({ line }: MoreRowProps) {
  return (
    <div className="flex h-6 items-center gap-2 pr-2 text-meta text-surface-400">
      <Guides depth={line.depth} parent={lineParent(line)} />
      <span className="w-3 shrink-0" />
      <SpinnerGapIcon className="size-3 animate-spin" />
      <span>{m.workshop_bin_more_label({ loaded: line.loaded, total: line.total })}</span>
    </div>
  );
}

interface GuidesProps {
  depth: number;
  /** The key of the row the line hangs under. Null at depth zero. */
  parent: string | null;
}

/**
 * One guide per open level, each under the caret of the level it belongs to.
 *
 * A guide runs the line's full height, so a block's guides join into one edge. The block
 * the reader stands in takes the accent, and the block under the pointer lifts a rung.
 */
export function Guides({ depth, parent }: GuidesProps) {
  const blocks = useMemo(() => guideBlocks(parent, depth), [parent, depth]);
  const { active, hover } = useGuideLevels(blocks);
  const indented = Math.min(depth, MAX_INDENT_DEPTH);
  const tone = (level: number) =>
    twMerge(
      "shrink-0 border-l border-surface-700/60",
      level === hover && "border-surface-600",
      level === active && "border-accent-500",
      level >= indented && "w-0.5",
    );
  return (
    <span className="flex shrink-0 translate-x-[6px] self-stretch" aria-hidden>
      {Array.from({ length: depth }, (_, level) => (
        <span
          key={level}
          className={tone(level)}
          style={level < indented ? { width: INDENT } : undefined}
        />
      ))}
    </span>
  );
}

interface CaretProps {
  expandable: boolean;
  expanded: boolean;
  loading: boolean;
}

function Caret({ expandable, expanded, loading }: CaretProps) {
  return (
    <span className="flex h-4 w-3 shrink-0 items-center justify-center text-surface-400">
      {loading && <SpinnerGapIcon className="size-3 animate-spin" />}
      {!loading && expandable && (
        <CaretRightIcon weight="bold" className={twMerge("size-3", expanded && "rotate-90")} />
      )}
    </span>
  );
}

interface NameCellProps {
  line: RowLine;
  expandable: boolean;
  expanded: boolean;
  loading: boolean;
}

/**
 * The row's name, and its tag after it. "The property row" in docs/ux/BIN_EDITOR.md.
 *
 * The indent is inside this cell rather than beside it, so the value column starts at one
 * x whatever the depth is and a run of rows reads as a column.
 */
function NameCell({ line, expandable, expanded, loading }: NameCellProps) {
  const { row, owner, depth } = line;
  const { edit } = useRowEdit(line.key);
  const keyRefusal = edit?.refused.get(keyMark(line.key));
  const declared = useDeclaredMark(line.key);
  const overrides = useRowOverrides(line.key);
  const objectChange = useDeclaredObject(objectEntry(row));
  const reported = useRowDiagnostics(line.key);
  /* A target is an object of another file, drawn as the heading its records sit under. */
  const target = row.node === "target";
  const object = row.node === "object" || target;
  const property = row.node === "property";
  const element = row.node === "element";
  const rekeyable = edit !== null && row.node === "entry";
  const held = element && row.value.type === "struct" ? row.value : null;
  const nameClasses = twMerge(
    /* An element's index is what a reader counts rows by, so the class beside it elides first. */
    element ? "shrink-0" : "truncate",
    object ? "font-medium text-surface-100" : "text-surface-200",
    element && "text-surface-400",
    row.unnamed && "text-surface-400",
    objectChange?.change === "removed" && "text-surface-400 line-through",
  );

  return (
    <span
      className={twMerge(
        "flex min-w-0 shrink-0 items-center gap-1.5 self-stretch",
        /* An element sits outside the column: its value follows its index rather than
           starting where a property's value does. */
        /* A target draws no class after its path, so the path takes the line and cuts in its
           middle, where the paths of one patch share their folders. */
        target && "min-w-0 flex-1",
        !target && outsideColumn(row.node) && "max-w-[60%]",
        !outsideColumn(row.node) && "w-[min(calc(var(--bin-name-cols)*1ch+2rem),50%)]",
      )}
    >
      <Guides depth={depth} parent={lineParent(line)} />
      <Caret expandable={expandable} expanded={expanded} loading={loading} />
      {object && (
        <ObjectGlyph
          objectClass={row.value.type === "struct" ? row.value.class : null}
          className="size-3.5 shrink-0 text-surface-400"
        />
      )}
      {property && (
        <FieldCard
          classHash={owner}
          fieldHash={fieldHash(row.path)}
          name={row.name}
          unnamed={row.unnamed}
          declared={row.declared}
          fileTag={rowTag(row)}
          triggerClassName={nameClasses}
        />
      )}
      {rekeyable && (
        <FieldDiscardContext value={() => edit.dismiss(keyMark(line.key))}>
          <TextEdit
            text={typedKey(row.name)}
            label={m.workshop_bin_edit_key_action()}
            invalid={keyRefusal !== undefined}
            autoFocus={false}
            onCommit={(text) => edit.setKey(line, text)}
          >
            <span className={nameClasses}>{row.name}</span>
          </TextEdit>
          {keyRefusal !== undefined && <RefusalMark refusal={keyRefusal} />}
        </FieldDiscardContext>
      )}
      {target && <CutText text={row.name} className={nameClasses} />}
      {!property && !rekeyable && !target && <span className={nameClasses}>{row.name}</span>}
      {repeatsKey(row) && (
        <Tooltip content={m.workshop_bin_repeated_key_hint()}>
          <WarningCircleIcon
            aria-label={m.workshop_bin_repeated_key_hint()}
            className="size-3.5 shrink-0 text-warning-text"
          />
        </Tooltip>
      )}
      {declared && <DeclaredRowMark mark={declared.mark} layer={declared.layer} />}
      {overrides.length > 0 && <OverrideRowMark overrides={overrides} />}
      {objectChange && <ObjectChangeMark change={objectChange.change} layer={objectChange.layer} />}
      <ChangeMark rowKey={line.key} />
      <DeclaredDiagnosticsMark diagnostics={reported} />
      {held && <ClassCard classHash={held.classHash} name={held.class} />}
      {!object && !element && <KindTag row={row} />}
    </span>
  );
}

/** The entry an object row stands for, and none for any other row. */
function objectEntry(row: BinRow): string {
  return row.node === "object" ? row.entry : "";
}

/** The row's kind in ritobin's words, and the Problems mark where the schema declares another. */
function KindTag({ row }: { row: BinRow }) {
  const tag = rowTag(row);
  if (tag === null) return null;
  const mismatch = row.declared !== null && row.declared.mismatch;

  return (
    <span className="flex shrink-0 items-center gap-1">
      {mismatch && (
        <Tooltip content={<DeclaredLine declared={row.declared} />}>
          <span role="img" aria-label={m.workshop_bin_mismatch_label()} className="flex">
            <SeverityGlyph severity="warning" />
          </span>
        </Tooltip>
      )}
      <span className={TAG_CLASSES}>{tag}</span>
    </span>
  );
}

/* A plain span rather than a component: the tooltip's render prop spreads its handlers
   onto the element it is given. */
/* DS-KIND-HUE, DS-TEXT. Dimmed only as far as AA contrast allows in both themes. */
const TAG_CLASSES = "text-bin-kind-text/85";
