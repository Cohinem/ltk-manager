import type { ReactNode } from "react";

import { Stack } from "@/components";

/** The padded band of notices between the toolbar and the content of the audio file document. */
export function NoticeBand({ children }: { children: ReactNode }) {
  return (
    <div data-ui="NoticeBand" className="shrink-0 p-2">
      <Stack gap={2}>{children}</Stack>
    </div>
  );
}
