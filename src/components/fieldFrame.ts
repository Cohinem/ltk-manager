import { focusField } from "./focus";

/** The control heights of DS-SIZE a field takes: 24, 28 and 32px. */
export type FieldSize = "xs" | "sm" | "md";

/**
 * The frame of a text input, and of a trigger drawn as one: DS-HOVER, DS-FOCUS.
 *
 * The error edge keys off `aria-invalid`, which a `Field.Root` holding an error sets on its
 * control and `hasError` sets on a control standing alone.
 */
export const fieldFrame = [
  "w-full rounded-md border transition-colors",
  "border-surface-500 bg-surface-700 text-surface-50 placeholder:text-surface-400",
  "hover:border-accent-hover",
  focusField,
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-invalid:border-danger aria-invalid:hover:border-danger aria-invalid:focus:border-danger aria-invalid:focus:ring-danger",
].join(" ");

export const fieldSizeClasses: Record<FieldSize, string> = {
  xs: "h-6 px-1.5 text-xs",
  sm: "h-7 px-2 text-xs",
  md: "h-8 px-2.5 text-sm",
};
