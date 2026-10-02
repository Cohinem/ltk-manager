import { createContext, type ReactNode, use, useSyncExternalStore } from "react";

import type { BinDocumentId, BinRow } from "@/lib/tauri";

import type { GraphItem } from "../utils/systemGraph";
import type { AddSection } from "./AddMenu";

/** What the graph's nodes act through, which the pane holds. */
export interface GraphActions {
  readonly document: BinDocumentId;
  /** The system object's entry hash. */
  readonly entry: string;
  /** What the preview node draws in its viewport box: the live viewport, or nothing. */
  readonly viewport: ReactNode;
  readonly collapsed: ReadonlySet<string>;
  readonly toggleCollapsed: (id: string) => void;
  /** Pop a driver or value embedded in its socket out to a node, or embed a popped one back. */
  readonly toggleEmbedded: (id: string) => void;
  /** Show `field` on the master node `master` at its default, until an edit writes it. */
  readonly addField: (master: string, field: string) => void;
  /** Collapse every other item of `item`'s type that has inputs, and expand `item`. */
  readonly collapseOthers: (item: GraphItem) => void;
  /** Show the row at a wire path in Properties. Null where the view offers no Properties. */
  readonly reveal: ((wire: string) => void) | null;
}

export const GraphActionsContext = createContext<GraphActions | null>(null);

/** The document a read outside any graph asks for, which answers nothing. */
export const NO_DOCUMENT = 0 as BinDocumentId;

/** What an empty socket plugs into itself: the quick add's title and its choices. */
export interface SocketPlug {
  readonly title: string;
  readonly sections: readonly AddSection[];
}

/**
 * The canvas's quick add, which an empty socket opens at a point on the screen.
 *
 * `plugs` holds every empty socket's plug by `socketKey`, so a drag released on the canvas
 * finds what its socket offers.
 */
export interface QuickAddHost {
  readonly plugs: Map<string, SocketPlug>;
  readonly open: (at: { readonly x: number; readonly y: number }, plug: SocketPlug) => void;
}

export const QuickAddContext = createContext<QuickAddHost | null>(null);

/** The key of an empty socket's plug: its node and its handle. */
export function socketKey(node: string, handle: string): string {
  return `${node} ${handle}`;
}

/** A field row a right click landed on inside a node, for the menu's row actions. */
export interface MenuRow {
  readonly row: BinRow;
  /** The class the field is read on, whose schema default Reset to default writes. */
  readonly owner: string | null;
  /** The row's value family carries a curve, which a reset drops. */
  readonly curve: boolean;
}

/** Tell the Graph pane's menu which field row a right click landed on. */
export const RowMenuContext = createContext<((row: MenuRow) => void) | null>(null);

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
