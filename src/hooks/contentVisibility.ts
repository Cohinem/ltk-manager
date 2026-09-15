import { createContext, use } from "react";

export const ContentVisibilityContext = createContext(true);

/** Whether every containing document and pane is visible. */
export function useContentVisible(): boolean {
  return use(ContentVisibilityContext);
}
