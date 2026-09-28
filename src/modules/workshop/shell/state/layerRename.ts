/* The layout sub-barrel rather than the module barrel: the full barrel pulls
   the editor's components, whose imports circle back into workshop state. */
// eslint-disable-next-line no-restricted-imports -- the cycle the comment above names
import type { LayoutNode } from "@/modules/editor/layout";

import {
  type ContentDocument,
  declarationsDocument,
  filesDocument,
  objectDocument,
  previewDocumentId,
  stringsDocument,
} from "../../documents/utils/contentDocument";
import { assetContext, assetPath } from "../../preview/utils/assetRef";
import type { ProjectEditor } from "./projectEditor";

/** One project's editor after the layer `from` is renamed to `to`, and the tab ids that changed. */
export interface RenamedLayer {
  readonly editor: ProjectEditor;
  /** Each changed id, old to new. */
  readonly ids: ReadonlyMap<string, string>;
}

/**
 * The editor after the layer `from` is renamed to `to`, or null when nothing in it names the
 * layer.
 *
 * A layer is identified by its name (ADR-0056), so the tabs of its files, its file tree, its
 * strings and its manifest move to the new name and keep their place.
 */
export function renamedLayer(editor: ProjectEditor, from: string, to: string): RenamedLayer | null {
  const moved = movedDocuments(editor, (document) => renamedDocument(document, from, to));

  const touchesState =
    editor.selectedLayer === from ||
    editor.selectedModule?.layer === from ||
    from in editor.collapsed;
  if (moved.ids.size === 0 && !touchesState) return null;

  const collapsed = { ...editor.collapsed };
  if (from in collapsed) {
    collapsed[to] = collapsed[from];
    delete collapsed[from];
  }

  return {
    ids: moved.ids,
    editor: {
      ...moved.editor,
      selectedLayer: editor.selectedLayer === from ? to : editor.selectedLayer,
      selectedModule:
        editor.selectedModule?.layer === from
          ? { ...editor.selectedModule, layer: to }
          : editor.selectedModule,
      collapsed,
    },
  };
}

/**
 * The editor with `document` in place of the tab `from`, or null when `from` is not open.
 * `document` takes the tab's group, position, pin and dirty flag.
 */
export function replacedDocument(
  editor: ProjectEditor,
  from: string,
  document: ContentDocument,
): ProjectEditor | null {
  if (!(from in editor.documents)) return null;

  return movedDocuments(editor, (held) => (held.id === from ? document : held)).editor;
}

/** The editor with each document replaced by what `move` returns for it, under the new id. */
function movedDocuments(
  editor: ProjectEditor,
  move: (document: ContentDocument) => ContentDocument,
): RenamedLayer {
  const ids = new Map<string, string>();
  const documents: Record<string, ContentDocument> = {};
  for (const document of Object.values(editor.documents)) {
    const moved = move(document);
    if (moved.id !== document.id) ids.set(document.id, moved.id);
    documents[moved.id] = moved;
  }

  const id = (held: string) => ids.get(held) ?? held;
  return {
    ids,
    editor: {
      ...editor,
      documents,
      layout: renamedTabs(editor.layout, id),
      previewIds: Object.fromEntries(
        Object.entries(editor.previewIds).map(([leaf, held]) => [leaf, id(held)]),
      ),
      pinned: editor.pinned.map(id),
      dirty: new Set([...editor.dirty].map(id)),
    },
  };
}

/** `document` moved to layer `to`, or `document` itself when it does not belong to `from`. */
export function renamedDocument(
  document: ContentDocument,
  from: string,
  to: string,
): ContentDocument {
  switch (document.kind) {
    case "files":
      return document.layerName === from ? filesDocument(to) : document;
    case "declarations":
      return document.layerName === from ? declarationsDocument(to) : document;
    case "strings":
      return document.layerName === from ? stringsDocument(to, document.locale) : document;
    case "preview":
    case "object": {
      const { asset } = document;
      if (asset.kind !== "layer" || asset.layer !== from) return document;

      const moved = { ...asset, layer: to };
      if (document.kind === "object") {
        return objectDocument(
          moved,
          document.objectHash,
          document.objectPath,
          document.file,
          document.objectClass ?? null,
          document.sandbox,
        );
      }
      return {
        ...document,
        id: previewDocumentId(moved, document.sandbox),
        asset: moved,
        context: assetContext(moved),
        path: assetPath(moved),
      };
    }
    default:
      return document;
  }
}

function renamedTabs(node: LayoutNode, id: (held: string) => string): LayoutNode {
  if (node.kind === "leaf") {
    return {
      ...node,
      tabs: node.tabs.map(id),
      activeTab: node.activeTab === null ? null : id(node.activeTab),
    };
  }

  return { ...node, children: node.children.map((child) => renamedTabs(child, id)) };
}
