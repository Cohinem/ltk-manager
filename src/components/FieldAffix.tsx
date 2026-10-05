import { type ReactNode } from "react";

import { twMerge } from "@/utils";

interface FieldAffixProps {
  children: ReactNode;
  className?: string;
}

/* A button here fills the field's height and loses its corners to the field's own. Its focus
   outline is drawn inset, since the affix clips anything outside it. */
const buttonClasses = [
  "[&_button]:h-full [&_button]:w-8 [&_button]:shrink-0 [&_button]:rounded-none",
  "[&_button]:text-surface-300",
  "[&_button:not([data-disabled]):hover]:bg-surface-600",
  "[&_button:not([data-disabled]):hover]:text-surface-100",
  "[&_button:not([data-disabled]):active]:bg-surface-500",
  "[&_button:focus-visible]:-outline-offset-2",
].join(" ");

/**
 * Holds controls against a field's trailing edge, inside its border.
 *
 * An `IconButton` placed in it takes the affix look from here, so the call site passes no
 * class. The field's input pads its own right edge to keep text clear of the affix.
 */
export function FieldAffix({ children, className }: FieldAffixProps) {
  return (
    <div
      className={twMerge(
        "absolute inset-y-px right-px flex items-stretch overflow-hidden rounded-r-md",
        buttonClasses,
        className,
      )}
    >
      {children}
    </div>
  );
}
