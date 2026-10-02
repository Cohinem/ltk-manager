import type { ReactNode } from "react";

import { StatusBar } from "../../shared/components/StatusBar";

interface PreviewStatusProps {
  /** What the file declares, left to right. Selectable, because a reader copies them. */
  facts: readonly string[];
  /** The viewer's own controls, at the strip's end. */
  children?: ReactNode;
}

/** The strip under a preview: the file's facts, and the controls that draw it. */
export function PreviewStatus({ facts, children }: PreviewStatusProps) {
  return (
    <StatusBar data-ui="PreviewStatus">
      {facts.map((fact) => (
        <span key={fact} className="select-text">
          {fact}
        </span>
      ))}
      {children && <div className="ml-auto flex items-center gap-1">{children}</div>}
    </StatusBar>
  );
}
