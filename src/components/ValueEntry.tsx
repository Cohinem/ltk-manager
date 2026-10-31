import {
  type KeyboardEvent as ReactKeyboardEvent,
  type SyntheticEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { twMerge } from "@/utils";

import { type EntryClose, type EntryDraft, entryOutcome } from "./entryOutcome";
import { focusField } from "./focus";

export { type EntryClose, entryOutcome, parseNumberText } from "./entryOutcome";

/** An open value entry: its draft, and whether the last close found no value in it. */
export interface OpenEntry extends EntryDraft {
  readonly invalid: boolean;
}

export interface ValueEntryOptions {
  /** `true` while the entry is open. Held by the caller. */
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Returns the text that the entry opens with. */
  readonly initialText: () => string;
  /** Returns the value that a text holds, or null if it holds none. */
  readonly parse: (text: string) => number | null;
  /** Takes the value of a commit. A promise that resolves `false` reopens the entry, marked. */
  readonly onCommit: (value: number) => void | Promise<boolean>;
}

export interface ValueEntryState {
  /** The open entry, or null while it is closed. */
  readonly entry: OpenEntry | null;
  readonly open: () => void;
  readonly setText: (text: string) => void;
  /** Closes the entry by `close`, which commits, cancels or marks it per `entryOutcome`. */
  readonly close: (close: EntryClose) => void;
}

/**
 * Holds the draft of a value entry that opens prefilled and closes on Enter, Escape or a press
 * outside.
 *
 * A commit closes the entry and calls `onCommit` once. If its promise resolves `false`, the entry
 * opens again with the typed text marked.
 */
export function useValueEntry({
  open,
  onOpenChange,
  initialText,
  parse,
  onCommit,
}: ValueEntryOptions): ValueEntryState {
  const [entry, setEntry] = useState<OpenEntry | null>(null);
  const [refused, setRefused] = useState<OpenEntry | null>(null);
  if (open && entry === null) {
    const text = initialText();
    setEntry(refused ?? { text, initial: text, invalid: false });
  }
  if (!open && entry !== null) setEntry(null);

  /* The input's blur follows the Enter or Escape that closed it, before the closed entry draws. */
  const live = useRef<OpenEntry | null>(null);
  useLayoutEffect(() => {
    live.current = entry;
  }, [entry]);

  function close(how: EntryClose) {
    const draft = live.current;
    if (draft === null) return;

    const outcome = entryOutcome(how, draft, parse);
    if (outcome.kind === "invalid") {
      setEntry({ ...draft, invalid: true });
      return;
    }

    live.current = null;
    setRefused(null);
    onOpenChange(false);
    if (outcome.kind === "cancel") return;

    const landed = onCommit(outcome.value);
    void landed?.then((applied) => {
      if (applied) return;

      setRefused({ text: draft.text, initial: draft.text, invalid: true });
      onOpenChange(true);
    });
  }

  function setText(text: string) {
    setEntry((current) => (current === null ? null : { ...current, text }));
  }

  return { entry, open: () => onOpenChange(true), setText, close };
}

export interface ValueEntryProps {
  readonly entry: OpenEntry;
  readonly onTextChange: (text: string) => void;
  readonly onClose: (close: EntryClose) => void;
  "aria-label": string;
  /** The room the text takes. */
  className?: string;
}

/**
 * The text field of a value entry, focused with its text selected as it draws.
 *
 * Enter and Escape close it, and so does a blur, as a press outside. A press inside it does not
 * reach the row under it.
 */
export function ValueEntry({
  entry,
  onTextChange,
  onClose,
  "aria-label": ariaLabel,
  className,
}: ValueEntryProps) {
  function keys(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" && event.key !== "Escape") return;

    event.preventDefault();
    event.stopPropagation();
    onClose(event.key === "Enter" ? "enter" : "escape");
  }

  return (
    <input
      type="text"
      autoFocus
      value={entry.text}
      aria-label={ariaLabel}
      aria-invalid={entry.invalid || undefined}
      data-ui="ValueEntry"
      className={twMerge(
        /* DS-VEIL, DS-RADIUS */
        "h-6 w-20 min-w-0 rounded-sm border border-surface-veil bg-surface-veil-soft px-1.5",
        "font-mono text-surface-100 tabular-nums select-text",
        focusField,
        entry.invalid && "border-danger focus:border-danger focus:ring-danger",
        className,
      )}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => onTextChange(event.target.value)}
      onKeyDown={keys}
      onBlur={() => onClose("outside")}
      onClick={stopAtEntry}
      onDoubleClick={stopAtEntry}
      onPointerDown={stopAtEntry}
    />
  );
}

/* The entry is a control of its own, so a press in it is not the row's. */
function stopAtEntry(event: SyntheticEvent) {
  event.stopPropagation();
}
