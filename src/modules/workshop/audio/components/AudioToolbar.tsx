import type { ReactNode } from "react";

import { Inline } from "@/components";

/** The filter band over a panel of the audio file document, ruled off from the list under it. */
export function AudioToolbar({ children }: { children: ReactNode }) {
  return (
    <div
      data-ui="AudioToolbar"
      className="shrink-0 border-b border-surface-700 px-2 py-1.5 text-meta text-surface-400 select-none"
    >
      <Inline gap={2}>{children}</Inline>
    </div>
  );
}
