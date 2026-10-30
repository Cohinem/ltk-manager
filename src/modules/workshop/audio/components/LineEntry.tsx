import { type KeyboardEvent, useRef, useState } from "react";

import { twMerge } from "@/utils";

import { LINE_FIELD_CLASSES } from "../../bin/tree/components/AddLineFrame";

interface LineEntryProps {
  readonly label: string;
  readonly initial: string;
  /** A whole number or any number, which an empty text clears. Absent for text. */
  readonly numeric?: "integer" | "number";
  /** Takes the typed text. A promise that resolves `false` keeps the entry open, marked. */
  readonly onCommit: (text: string) => Promise<boolean>;
  readonly onClose: () => void;
  readonly className?: string;
}

/** A whole number, and any decimal number, as a numeric entry takes one. */
const INTEGER = /^-?\d+$/;
const NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * The text entry of a cell, opened in place of its text, focused with the text selected.
 *
 * Enter and a press outside commit, and Escape closes it unchanged. A numeric entry refuses a text
 * that is not a whole number, and keeps it open marked.
 */
export function LineEntry({
  label,
  initial,
  numeric,
  onCommit,
  onClose,
  className,
}: LineEntryProps) {
  const [text, setText] = useState(initial);
  const [refused, setRefused] = useState(false);
  /* The blur that follows an Enter or an Escape must not commit a second time. */
  const settled = useRef(false);

  function close() {
    settled.current = true;
    onClose();
  }

  function commit() {
    if (settled.current) return;
    if (text === initial) {
      close();
      return;
    }
    const pattern = numeric === "integer" ? INTEGER : NUMBER;
    if (numeric !== undefined && text.trim() !== "" && !pattern.test(text.trim())) {
      setRefused(true);
      return;
    }

    settled.current = true;
    void onCommit(text).then((applied) => {
      if (applied) {
        onClose();
        return;
      }
      settled.current = false;
      setRefused(true);
    });
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  return (
    <input
      autoFocus
      data-draft
      aria-label={label}
      aria-invalid={refused}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        setRefused(false);
      }}
      onKeyDown={keyDown}
      onBlur={commit}
      onClick={(event) => event.stopPropagation()}
      onFocus={(event) => event.currentTarget.select()}
      className={twMerge(
        LINE_FIELD_CLASSES,
        "w-full font-sans text-row",
        numeric !== undefined && "font-mono text-code tabular-nums",
        refused && "border-danger focus:border-danger",
        className,
      )}
    />
  );
}
