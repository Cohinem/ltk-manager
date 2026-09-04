import { Fragment, type ReactNode } from "react";

/** What a message wraps around the span its component draws differently. */
const MARK = "*";

interface MarkedProps {
  /** A compiled message, whose marked spans this draws through `children`. */
  text: string;
  /** What one marked span is drawn as. */
  children: (marked: string) => ReactNode;
}

/**
 * A message drawn with its marked spans wrapped in something of their own.
 *
 * The catalog holds one whole sentence per key, so a translator can move the
 * emphasis through it or drop it - which two keys cut at the markup's own
 * boundary could never allow. Unbalanced marks draw the wrong span rather than
 * throwing, because a typo in the catalog must not blank the panel around it.
 */
export function Marked({ text, children }: MarkedProps) {
  return text
    .split(MARK)
    .map((part, index) => (
      <Fragment key={index}>{index % 2 === 1 ? children(part) : part}</Fragment>
    ));
}
