import { createContext, use, useLayoutEffect } from "react";

import { useContentVisible } from "@/hooks";

/**
 * How a document tells its editor group that it draws its own framed panes. The call
 * reports them, and the function it returns takes the report back.
 *
 * The group reads the reports in place of a `:has()` selector on its own element. Chromium
 * restyles the whole subtree of an element matched through `:has()` on any child-list change
 * under it, and the subtree of an editor group is every element of every open document.
 */
export const IslandsContext = createContext<(() => () => void) | null>(null);

/**
 * Report to the editor group around the caller that its document draws framed panes, while
 * the caller is shown. `EditorSurface` then paints no ground and no frame of its own.
 */
export function useIslands(): void {
  const report = use(IslandsContext);
  const visible = useContentVisible();

  /* Before paint, so the group never draws its own frame around a shell for a frame. */
  useLayoutEffect(() => {
    if (report === null || !visible) return;

    return report();
  }, [report, visible]);
}
