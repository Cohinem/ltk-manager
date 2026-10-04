import { CaretRightIcon } from "@phosphor-icons/react";

import { twMerge } from "@/utils";

export interface FoldCaretProps {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly label: string;
  /** The caret's box, for a row shorter than a field row. */
  readonly className?: string;
}

/**
 * A row's fold, in the gutter before its name so the names stay in one column. The row
 * itself folds on a click too, so the caret keeps its click to itself.
 */
export function FoldCaret({ open, onToggle, label, className }: FoldCaretProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      className={twMerge(
        "flex h-6 w-4 shrink-0 cursor-pointer items-center justify-center text-surface-400 hover:text-surface-100",
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <CaretRightIcon weight="bold" className={twMerge("size-3", open && "rotate-90")} />
    </button>
  );
}
