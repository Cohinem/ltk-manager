import { type KeyboardEvent, type MouseEvent as ReactMouseEvent, useRef, useState } from "react";

import { twMerge } from "@/utils";

export interface ReadoutProps {
  /**
   * The value as text, which is the only shape that carries every kind.
   *
   * A 64-bit integer does not survive a JS number, so a caller holding one passes the
   * digits it was given rather than parsing them.
   */
  value: string;
  /** The letter naming one component of a vector or a colour, drawn left of the value. */
  label?: string;
  "aria-label"?: string;
  /** The room the value takes. Not the label, which is as wide as its letter. */
  className?: string;
  /** Take an edit, as the text the field holds when it is left or Enter is pressed. */
  onCommit?: (text: string) => void;
  /** The last text the field committed was refused. */
  invalid?: boolean;
  /** Focus the field and select its text on mount, for a field that opens to be typed in. */
  autoFocus?: boolean;
  /** The field was left, after any commit. */
  onLeave?: () => void;
  /** The field was left by a bare `Enter`, after the commit and `onLeave`. */
  onEnter?: () => void;
}

/**
 * A value in the field it is edited in, or will be.
 *
 * The field is drawn at rest rather than on hover, so a value reads as something the
 * document holds rather than as text laid over the row. A read-only one takes no focus,
 * because a document of them would otherwise be a tab order thousands of stops long.
 * An editable one holds its draft until the value it was typed over changes.
 */
export function Readout({
  value,
  label,
  "aria-label": ariaLabel,
  className,
  onCommit,
  invalid = false,
  autoFocus = false,
  onLeave,
  onEnter,
}: ReadoutProps) {
  const [draft, setDraft] = useState<{ text: string; over: string } | null>(null);
  /* An Escape blurs the field in the same handler, before the discarded draft re-renders. */
  const discarding = useRef(false);
  const editable = onCommit !== undefined;
  const shown = draft !== null && draft.over === value ? draft.text : value;

  function commit() {
    if (discarding.current) {
      discarding.current = false;
    } else if (draft !== null && draft.over === value && draft.text !== value) {
      onCommit?.(draft.text);
    }
    onLeave?.();
  }

  function keys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      if (!event.ctrlKey && !event.metaKey) onEnter?.();
    }
    if (event.key === "Escape") {
      discarding.current = true;
      setDraft(null);
      event.currentTarget.blur();
    }
  }

  const field = (
    <input
      type="text"
      readOnly={!editable}
      tabIndex={editable ? 0 : -1}
      value={shown}
      aria-label={ariaLabel ?? label}
      aria-invalid={invalid || undefined}
      data-draft={shown !== value || undefined}
      autoFocus={autoFocus}
      onFocus={autoFocus ? (event) => event.currentTarget.select() : undefined}
      data-ui="Readout"
      className={twMerge(
        "min-w-0 bg-surface-veil-soft px-1.5 py-0.5",
        "font-mono text-surface-200 tabular-nums select-text focus:outline-none",
        editable ? "cursor-text" : "cursor-default",
        /* DS-VEIL, DS-HOVER, DS-RADIUS. The wrapper draws them for a labelled one. */
        label === undefined &&
          "rounded-sm border border-surface-veil transition-colors hover:border-accent-hover",
        label === undefined && editable && "focus:border-accent-500",
        label === undefined && invalid && "border-danger",
        className,
      )}
      onClick={keepRowShut}
      onChange={
        editable ? (event) => setDraft({ text: event.target.value, over: value }) : undefined
      }
      onKeyDown={editable ? keys : undefined}
      onBlur={editable ? commit : undefined}
    />
  );

  if (label === undefined) return field;

  /* The letter rides a rung above the value, so the pair reads as one control with a
     named half rather than as a caption beside a box. */
  return (
    <span
      /* DS-VEIL, DS-HOVER, DS-RADIUS */
      className={twMerge(
        "inline-flex items-stretch overflow-hidden rounded-sm border border-surface-veil transition-colors hover:border-accent-hover",
        editable && "focus-within:border-accent-500",
        invalid && "border-danger",
      )}
    >
      <span
        aria-hidden
        /* DS-WEIGHT-TIER: weight rather than size, which a dense row has no room for. */
        className="flex items-center bg-surface-veil px-1.5 font-mono font-semibold text-surface-300 select-none"
      >
        {label}
      </span>
      {field}
    </span>
  );
}

/* The field is a control of its own, so a click that lands in it is not the row's. */
function keepRowShut(event: ReactMouseEvent<HTMLInputElement>) {
  event.stopPropagation();
}
