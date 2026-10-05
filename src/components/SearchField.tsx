import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";

import { twMerge } from "@/utils";

import { IconButton } from "./Button";
import { focusRing } from "./focus";
import { Field } from "./FormField";
import { Tooltip } from "./Tooltip";

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** The box's own name, and its placeholder unless `placeholder` replaces it. */
  label: string;
  placeholder?: string;
  clearLabel: string;
  /** Absent where the box narrows rows already on screen, which no regex reaches. */
  regex?: boolean;
  onRegexChange?: (regex: boolean) => void;
  /** The placeholder while the pattern reads as a regex. */
  regexLabel?: string;
  regexToggleLabel?: string;
  /** `Enter` or `ArrowDown`, which hand the keyboard to the rows below. */
  onCommit?: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** The input's text size, `text-xs` unless set. */
  textClassName?: string;
  /** What sits after the box in its row: a count, a spinner. */
  children?: ReactNode;
}

/**
 * A toolbar's find box: a pattern behind a magnifier, an optional regex toggle, and a clear.
 *
 * `Escape` empties a box that holds something and otherwise passes. The count and the spinner
 * after it are the caller's, since what they read differs per screen.
 */
export function SearchField({
  value,
  onChange,
  label,
  placeholder,
  clearLabel,
  regex,
  onRegexChange,
  regexLabel,
  regexToggleLabel,
  onCommit,
  inputRef,
  textClassName = "text-xs",
  children,
}: SearchFieldProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && value.length > 0) {
      event.preventDefault();
      onChange("");
    }

    if (onCommit && (event.key === "Enter" || event.key === "ArrowDown")) {
      event.preventDefault();
      onCommit();
    }
  }

  return (
    <>
      <Field.Root className="relative min-w-0 flex-1">
        <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-surface-400" />
        <Field.Control
          ref={inputRef}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={regex ? regexLabel : (placeholder ?? label)}
          aria-label={label}
          autoComplete="off"
          spellCheck={false}
          size="xs"
          className={twMerge("pl-7 select-text", textClassName, onRegexChange ? "pr-14" : "pr-7")}
        />
        <span className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5">
          {value && (
            <IconButton
              icon={<XIcon />}
              size="row"
              onClick={() => {
                onChange("");
                inputRef?.current?.focus();
              }}
              aria-label={clearLabel}
            />
          )}
          {onRegexChange && (
            <Tooltip content={regexToggleLabel}>
              <button
                type="button"
                aria-pressed={regex}
                onClick={() => onRegexChange(!regex)}
                className={twMerge(
                  "flex h-4.5 cursor-pointer items-center rounded-sm px-1 font-mono text-fine text-surface-400 transition-colors",
                  /* DS-VEIL */ "hover:bg-surface-veil hover:text-surface-100",
                  focusRing,
                  regex &&
                    "bg-accent-500/20 text-accent-300 hover:bg-accent-500/30 hover:text-accent-300",
                )}
              >
                .*
              </button>
            </Tooltip>
          )}
        </span>
      </Field.Root>
      {children}
    </>
  );
}
