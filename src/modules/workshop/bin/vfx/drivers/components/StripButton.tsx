import type { ReactNode } from "react";

import { Tooltip } from "@/components";

/** One icon button of a preview's strip, lit while `pressed`. */
export function StripButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        /* DS-VEIL, DS-RADIUS */
        className="nodrag flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-sm text-surface-400 hover:bg-surface-veil hover:text-surface-100 aria-pressed:text-accent-400"
        onClick={onClick}
      >
        {children}
      </button>
    </Tooltip>
  );
}
