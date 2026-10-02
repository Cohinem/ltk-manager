import { create } from "zustand";

import {
  type IndexBrowserSlice,
  indexBrowserSlice,
  withoutSubtree,
} from "../../shared/state/indexBrowser";
import { ancestorPrefixes, isBelowPrefix, type ObjectTreeNode } from "../utils/objectTree";

interface ObjectsBrowserStore extends IndexBrowserSlice {
  selected: { path: string; type: "object" | "prefix" } | null;
  selectNode: (node: Pick<ObjectTreeNode, "id" | "type">) => void;
  setView: (view: "tree" | "grid") => void;
  display: { view: "tree" | "grid"; thumbnails: boolean; location: string; tileSize: number };
  setDisplay: (display: Partial<ObjectsBrowserStore["display"]>) => void;
  /** Collapse every one of `paths` in the search results tree. */
  collapseFindPrefixes: (paths: readonly string[]) => void;
  /** Expand `path` and every prefix below it in the search results tree. */
  expandFindSubtree: (path: string) => void;
}

/**
 * What the objects browser is showing, held outside the document that draws it.
 *
 * The leaf a preview splits remounts the document under it. A tree held in the document
 * shuts on the click that opened the object. One store across the projects: every
 * objects tab browses one install.
 */
export const useObjectsBrowserStore = create<ObjectsBrowserStore>()((set) => ({
  ...indexBrowserSlice(set, isBelowPrefix),
  selected: null,
  selectNode: (node) => {
    if (node.type !== "object" && node.type !== "prefix") return;
    const type = node.type;
    set((state) =>
      state.selected?.path === node.id && state.selected.type === type
        ? state
        : { selected: { path: node.id, type } },
    );
  },
  setView: (view) =>
    set((state) => {
      const selected = state.selected;
      if (view === state.display.view || selected === null) {
        return { display: { ...state.display, view } };
      }

      /* The search results tree takes no reveal, so a search keeps its hits in place. */
      if (view === "tree" && state.searchPattern.length > 0) {
        return { display: { ...state.display, view } };
      }

      if (view === "tree") {
        const token = state.revealToken + 1;
        return {
          display: { ...state.display, view },
          expanded: new Set([...state.expanded, ...ancestorPrefixes(selected.path)]),
          revealToken: token,
          reveal: { id: selected.path, token },
        };
      }

      if (selected.type === "prefix") {
        return {
          display: { ...state.display, view, location: selected.path },
          searchPattern: "",
          reveal: null,
        };
      }

      const token = state.revealToken + 1;
      return {
        display: { ...state.display, view, location: ancestorPrefixes(selected.path).at(-1) ?? "" },
        revealToken: token,
        reveal: { id: selected.path, token },
      };
    }),
  display: { view: "tree", thumbnails: true, location: "", tileSize: 128 },
  setDisplay: (display) => set((state) => ({ display: { ...state.display, ...display } })),
  collapseFindPrefixes: (paths) =>
    set((state) => ({ shutFind: new Set([...state.shutFind, ...paths]) })),
  expandFindSubtree: (path) =>
    set((state) => ({ shutFind: withoutSubtree(state.shutFind, path, isBelowPrefix) })),
}));

export const useExpandedObjectPrefixes = () => useObjectsBrowserStore((s) => s.expanded);
export const useObjectsDisplay = () => useObjectsBrowserStore((s) => s.display);
export const useSetObjectsDisplay = () => useObjectsBrowserStore((s) => s.setDisplay);
export const useSelectObjectNode = () => useObjectsBrowserStore((s) => s.selectNode);
export const useSelectedObjectPath = () => useObjectsBrowserStore((s) => s.selected?.path ?? null);
export const useSetObjectsView = () => useObjectsBrowserStore((s) => s.setView);
export const useToggleObjectPrefix = () => useObjectsBrowserStore((s) => s.toggleExpanded);
export const useExpandObjectPrefixes = () => useObjectsBrowserStore((s) => s.expand);
export const useCollapseObjectPrefixSubtree = () =>
  useObjectsBrowserStore((s) => s.collapseSubtree);
export const useCollapseAllObjectPrefixes = () => useObjectsBrowserStore((s) => s.collapseAll);
export const useObjectsSearchPattern = () => useObjectsBrowserStore((s) => s.searchPattern);
export const useSetObjectsSearchPattern = () => useObjectsBrowserStore((s) => s.setSearchPattern);
export const useObjectsSearchRegex = () => useObjectsBrowserStore((s) => s.searchRegex);
export const useSetObjectsSearchRegex = () => useObjectsBrowserStore((s) => s.setSearchRegex);
export const useShutFindPrefixes = () => useObjectsBrowserStore((s) => s.shutFind);
export const useToggleFindPrefix = () => useObjectsBrowserStore((s) => s.toggleFind);
export const useCollapseFindPrefixes = () => useObjectsBrowserStore((s) => s.collapseFindPrefixes);
export const useExpandFindSubtree = () => useObjectsBrowserStore((s) => s.expandFindSubtree);
export const useObjectsReveal = () => useObjectsBrowserStore((s) => s.reveal);
export const useRequestObjectsReveal = () => useObjectsBrowserStore((s) => s.requestReveal);
export const useSettleObjectsReveal = () => useObjectsBrowserStore((s) => s.settleReveal);
