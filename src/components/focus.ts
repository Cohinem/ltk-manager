/**
 * The focus indicator of every control that is not a text input: DS-FOCUS.
 *
 * The colour is set at rest, so `transition-colors` has no outline colour to fade in from.
 */
export const focusRing =
  "outline-accent-500 focus-visible:outline-2 focus-visible:outline-offset-2";

/** `focusRing` drawn inside the control, for one whose container clips an outset outline. */
export const focusRingInset =
  "outline-accent-500 focus-visible:outline-2 focus-visible:-outline-offset-2";

/** The focus indicator of a text input, and of a trigger drawn as one: DS-FOCUS. */
export const focusField =
  "focus:border-accent-500 focus:ring-1 focus:ring-accent-500 focus:outline-none";
