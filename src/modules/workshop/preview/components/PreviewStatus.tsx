import type { ReactNode } from "react";

interface PreviewStatusProps {
  /** What the file declares, left to right. Selectable, because a reader copies them. */
  facts: readonly string[];
  /** The viewer's own controls, at the strip's end. */
  children?: ReactNode;
}

/** The strip under a preview: the file's facts, and the controls that draw it. */
export function PreviewStatus({ facts, children }: PreviewStatusProps) {
  return (
    <div
      data-ui="PreviewStatus"
      className="flex h-8 shrink-0 items-center gap-3 border-t border-surface-700/50 bg-surface-900 px-3 font-mono text-xs text-surface-400 select-none"
    >
      {facts.map((fact) => (
        <span key={fact} className="select-text">
          {fact}
        </span>
      ))}
      {children && <div className="ml-auto flex items-center gap-1">{children}</div>}
    </div>
  );
}
