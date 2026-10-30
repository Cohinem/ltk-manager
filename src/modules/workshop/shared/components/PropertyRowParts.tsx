import { CaretRightIcon, type Icon, SpinnerGapIcon } from "@phosphor-icons/react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";

import { IconButton, Readout } from "@/components";
import { twMerge } from "@/utils";

import { useGuideLevels } from "../state/treeGuides";
import { INDENT, MAX_INDENT_DEPTH, NAME_COLS_VAR } from "../utils/propertyRows";

/**
 * The frame of one property row: one line, the hover veil and the focus veil.
 *
 * DS-VEIL, DS-RADIUS. No transition: a fade in and out under a pointer crossing a list of 24px
 * rows reads as a flicker rather than as a highlight.
 */
export const PROPERTY_ROW_CLASSES =
  "group/row group/reveal flex min-h-6 items-center gap-2 rounded-sm pr-2 outline-none hover:bg-surface-veil-soft focus-visible:bg-surface-veil";

/**
 * The width of the name cell of a row whose value starts in the value column.
 *
 * The list sets the width in characters through `nameColumnStyle`, and the cell stops at half the
 * row. "The property row" in docs/ux/BIN_EDITOR.md.
 */
export const NAME_COLUMN_CLASSES = `w-[min(calc(var(${NAME_COLS_VAR})*1ch+2rem),50%)]`;

/** Returns the style that sets the name column of a list to `cols` characters. */
export function nameColumnStyle(cols: number): CSSProperties {
  return { [NAME_COLS_VAR]: cols } as CSSProperties;
}

/** The room a number on its own takes, so a column of rows lines its digits up. */
export const SCALAR_WIDTH = "w-[var(--bin-scalar-width,8rem)]";

interface RowGuidesProps {
  depth: number;
  /** The key of the row that holds each level, outermost first. */
  blocks: readonly string[];
}

/**
 * One guide per open level, each under the caret of the level it belongs to.
 *
 * A guide runs the line's full height, so a block's guides join into one edge. The block the
 * reader stands in takes the accent, and the block under the pointer lifts a rung.
 */
export function RowGuides({ depth, blocks }: RowGuidesProps) {
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

interface RowCaretProps {
  expandable: boolean;
  expanded: boolean;
  loading?: boolean;
}

/** The caret of a property row, a spinner while its rows load, and an empty slot on a leaf. */
export function RowCaret({ expandable, expanded, loading = false }: RowCaretProps) {
  return (
    <span className="flex h-4 w-3 shrink-0 items-center justify-center text-surface-400">
      {loading && <SpinnerGapIcon className="size-3 animate-spin" />}
      {!loading && expandable && (
        <CaretRightIcon weight="bold" className={twMerge("size-3", expanded && "rotate-90")} />
      )}
    </span>
  );
}

/* DS-KIND-HUE, DS-TEXT. Dimmed only as far as AA contrast allows in both themes. */
const TAG_CLASSES = "text-bin-kind-text/85";

/** The kind tag after a row's name, in ritobin's words. */
export function RowKindTag({ tag }: { tag: string }) {
  return <span className={twMerge("shrink-0 font-mono", TAG_CLASSES)}>{tag}</span>;
}

interface RowActionProps {
  label: string;
  icon: Icon;
  onAct: () => void;
}

/** A hover action of an editable row, which leaves the row's own click alone. */
export function RowAction({ label, icon: Glyph, onAct }: RowActionProps) {
  return (
    <IconButton
      size="row"
      label={label}
      icon={<Glyph />}
      muted
      reveal
      data-row-action
      className="shrink-0"
      onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onAct();
      }}
    />
  );
}

interface NumberCellProps {
  text: string;
  /** The unit after the box, or null for a number without one. */
  unit: string | null;
  step?: number | "integer";
  "aria-label"?: string;
  invalid?: boolean;
  /** Focus the box as it draws. */
  autoFocus?: boolean;
  /** A bare `Enter` left the box. */
  onEnter?: () => void;
  /** The box was left, after any commit. */
  onLeave?: () => void;
  /** Take an edit. Absent, the box is read-only. */
  onCommit?: (text: string) => void;
}

/** A number in the box it is edited in, and the unit it is measured in after it. */
export function NumberCell({
  text,
  unit,
  step = 1,
  "aria-label": ariaLabel,
  invalid,
  autoFocus,
  onEnter,
  onLeave,
  onCommit,
}: NumberCellProps) {
  const box = (
    <Readout
      value={text}
      step={step}
      aria-label={ariaLabel}
      className={SCALAR_WIDTH}
      invalid={invalid}
      autoFocus={autoFocus}
      onEnter={onEnter}
      onLeave={onLeave}
      onCommit={onCommit}
    />
  );
  if (unit === null) return box;

  return (
    <span className="flex min-w-0 items-center gap-1">
      {box}
      <UnitSuffix unit={unit} />
    </span>
  );
}

/** What a number is measured in, after its box. */
export function UnitSuffix({ unit }: { unit: string }) {
  return <span className="shrink-0 text-surface-400 select-none">{unit}</span>;
}
