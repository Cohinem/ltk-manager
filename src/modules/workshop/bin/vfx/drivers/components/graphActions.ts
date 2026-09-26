import { createContext, type ReactNode } from "react";

import type { BinDocumentId } from "@/lib/tauri";

/** What the graph's nodes act through, which the pane holds. */
export interface GraphActions {
  readonly document: BinDocumentId;
  /** The system object's entry hash. */
  readonly entry: string;
  /** What the preview node draws in its viewport box: the live viewport, or nothing. */
  readonly viewport: ReactNode;
  readonly collapsed: ReadonlySet<string>;
  readonly toggleCollapsed: (id: string) => void;
  /** Show the row at a wire path in Properties. Null where the view offers no Properties. */
  readonly reveal: ((wire: string) => void) | null;
}

export const GraphActionsContext = createContext<GraphActions | null>(null);
