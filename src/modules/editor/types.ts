import type { ComponentType, ReactNode } from "react";

/** The least a surface needs to know about what it is showing. */
export interface EditorDocumentBase {
  id: string;
  kind: string;
}

export interface EditorTabLabel {
  title: string;
  /** Dim text after the title, saying where the document lives. */
  context?: string;
  /** What the tab's Copy path writes. Absent for a document no path addresses. */
  path?: string;
}

export interface EditorDocumentProps<D extends EditorDocumentBase> {
  document: D;
  /** This document is the one on screen. Editors bind their shortcuts on it. */
  active: boolean;
}

export interface EditorDocumentDefinition<D extends EditorDocumentBase> {
  icon: (document: D) => ReactNode;
  label: (document: D) => EditorTabLabel;
  component: ComponentType<EditorDocumentProps<D>>;
  /**
   * Items this document adds to the top of its own tab's context menu.
   *
   * A right click on a tab is where a user looks for what the tab is about,
   * and the strip's own items are all about closing it. Returned as an
   * element rather than a list, so whatever it needs to read comes from hooks
   * in its own body - the menu mounts only while it is open.
   */
  tabMenu?: (document: D) => ReactNode;
}

/** The editors a surface can host, one per document kind. */
export type EditorRegistry<D extends EditorDocumentBase> = {
  [K in D["kind"]]: EditorDocumentDefinition<Extract<D, { kind: K }>>;
};
