import type { ReactNode } from "react";

/** A one-line note across the top of a pane, under its toolbar. */
export function PaneHint({ children }: { children: ReactNode }) {
  return (
    <p className="shrink-0 border-b border-surface-700/50 px-3 py-1.5 text-xs text-surface-400 select-none">
      {children}
    </p>
  );
}
