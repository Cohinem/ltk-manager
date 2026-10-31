import { createContext, type MouseEvent, type RefObject } from "react";

import type { AssetRef, BinDocumentId, BinObjectHeader, ReadOnly } from "@/lib/tauri";

import type { ShellKind } from "../../shell/utils/shellPanes";

/** Which way an object tab draws its object: its class's layout, or the tree. */
export type ObjectMode = "layout" | "properties";

/** What an object tab offers the menu bar of the view it draws. */
export interface ObjectMenu {
  /** The editor's id for the tab, which the save, the history and the palette are keyed on. */
  readonly documentId: string;
  readonly document: BinDocumentId;
  readonly asset: AssetRef;
  readonly object: BinObjectHeader;
  readonly file: string;
  /** The gate the document stands behind, null where it takes edits. */
  readonly readOnly: ReadOnly | null;
  readonly mode: ObjectMode;
  readonly onMode: (mode: ObjectMode) => void;
  /** The word of the layout mode, null for a class without a layout. */
  readonly layoutTitle: string | null;
  readonly shell: ShellKind | undefined;
  /** `true` while the tab draws the panes of the shell. */
  readonly shelled: boolean;
  /** The tab, whose focus Alt and F10 move to the bar. */
  readonly keyScope: RefObject<HTMLElement | null>;
  readonly onShowInFile: (event: MouseEvent) => void;
  /** Opens the dialog of the duplicate, absent where the document takes no edit. */
  readonly onDuplicate?: () => void;
  /** Collapses every row of the properties tree, absent where the tab does not draw the tree. */
  readonly onCollapseAll?: () => void;
  /** Opens the document again after a reload replaced its tree. */
  readonly onReload: () => void;
}

/** The menu facts of the enclosing object tab, or null outside one. */
export const ObjectMenuContext = createContext<ObjectMenu | null>(null);
