import type { ComponentProps } from "react";

import { twMerge } from "@/utils";

/** The strip along a document's foot: its facts in mono, its viewer controls at the end. */
export function StatusBar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={twMerge(
        "flex h-8 shrink-0 items-center gap-3 border-t border-surface-700/50 bg-surface-900 px-3 font-mono text-xs text-surface-400 select-none",
        className,
      )}
    />
  );
}
