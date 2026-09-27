import { createContext, type ReactNode, use, useSyncExternalStore } from "react";

import type { BinDocumentId } from "@/lib/tauri";

import type { GraphItem } from "../utils/systemGraph";

/** What the graph's nodes act through, which the pane holds. */
export interface GraphActions {
  readonly document: BinDocumentId;
  /** The system object's entry hash. */
  readonly entry: string;
  /** What the preview node draws in its viewport box: the live viewport, or nothing. */
  readonly viewport: ReactNode;
  readonly collapsed: ReadonlySet<string>;
  readonly toggleCollapsed: (id: string) => void;
  /** Pop a driver embedded in its socket out to a node, or embed a popped one back. */
  readonly toggleEmbedded: (id: string) => void;
  /** Show `field` on the master node `master` at its default, until an edit writes it. */
  readonly addField: (master: string, field: string) => void;
  /** Collapse every other item of `item`'s type that has inputs, and expand `item`. */
  readonly collapseOthers: (item: GraphItem) => void;
  /** Show the row at a wire path in Properties. Null where the view offers no Properties. */
  readonly reveal: ((wire: string) => void) | null;
}

export const GraphActionsContext = createContext<GraphActions | null>(null);

/** The node surfaces loop one particle's life rather than follow the run's at the cursor. */
export const LoopedSurfacesContext = createContext(false);

/**
 * The node selected alone on a canvas, which the canvas writes and each node reads.
 *
 * A node subscribes to whether it is that node, so a pick re-renders the two nodes it moves
 * between rather than every node scanning the selection on each store update.
 */
export class SolePick {
  private id: string | null = null;
  private readonly listeners = new Set<() => void>();

  set(id: string | null): void {
    if (id === this.id) return;

    this.id = id;
    for (const listener of this.listeners) listener();
  }

  is(id: string): boolean {
    return this.id === id;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

export const SolePickContext = createContext<SolePick | null>(null);

const NO_SUBSCRIPTION = () => () => undefined;

/** Whether node `id` is the only node selected, which the panes beside the graph follow. */
export function useSolePick(id: string): boolean {
  const pick = use(SolePickContext);
  return useSyncExternalStore(pick?.subscribe ?? NO_SUBSCRIPTION, () => pick?.is(id) ?? false);
}
