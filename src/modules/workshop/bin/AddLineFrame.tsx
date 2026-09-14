import { PlusIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Tooltip } from "@/components";
import { errorSummary } from "@/i18n";
import type { AppError } from "@/lib/tauri";

import { Guides } from "./BinRow";
import type { AddLine } from "./binRows";

interface AddLineFrameProps {
  line: AddLine;
  /** The add is on its way. */
  pending: boolean;
  /** Why the last add was refused. */
  error: AppError | null;
  /** The field the line is typed or pressed in. */
  children: ReactNode;
}

/** The row an add line draws as: its guides, its mark, its field, and a refusal after it. */
export function AddLineFrame({ line, pending, error, children }: AddLineFrameProps) {
  return (
    <div
      data-ui="BinDocument:add-line"
      role="treeitem"
      aria-level={line.depth + 1}
      className="group/row flex min-h-6 items-center gap-2 rounded-sm pr-2 text-mono-row"
    >
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <Guides depth={line.depth} />
        <span className="flex h-4 w-3 shrink-0 items-center justify-center text-surface-400">
          {pending && <SpinnerGapIcon className="h-3 w-3 animate-spin" />}
          {!pending && <PlusIcon weight="bold" className="h-3 w-3" />}
        </span>
        {children}
        {error !== null && (
          <Tooltip content={errorSummary(error)}>
            <WarningCircleIcon className="h-3.5 w-3.5 shrink-0 text-danger-text" />
          </Tooltip>
        )}
      </span>
    </div>
  );
}

/* DS-VEIL, DS-RADIUS */
export const LINE_FIELD_CLASSES =
  "h-5 w-full max-w-md min-w-0 rounded-sm border border-transparent bg-transparent px-1.5 py-0 font-mono text-mono-row text-surface-200 placeholder:text-surface-400 hover:border-surface-veil focus:border-accent-500 focus:ring-0 focus:outline-none";
