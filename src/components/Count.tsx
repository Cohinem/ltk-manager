import type { ReactNode } from "react";

import { twMerge } from "@/utils";

export interface CountProps {
  readonly className?: string;
  readonly children: ReactNode;
}

/** How many rows, matches or items a list holds, as a muted number beside it. */
export function Count({ className, children }: CountProps) {
  return (
    <span
      className={twMerge("shrink-0 text-meta text-surface-400 tabular-nums select-none", className)}
    >
      {children}
    </span>
  );
}
