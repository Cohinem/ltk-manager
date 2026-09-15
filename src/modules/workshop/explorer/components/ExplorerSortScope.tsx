import { createContext, type ReactNode, use, useCallback } from "react";

import { useProjectContext } from "../../projects/state/ProjectContext";
import { useExplorerStore } from "../../state";
import { DEFAULT_SORT, type ExplorerSort } from "../utils/sort";

const SortScope = createContext("sidebar:game");

/** The project and document owning an explorer's ordering. */
export function ExplorerSortScope({
  documentId,
  children,
}: {
  documentId: string;
  children: ReactNode;
}) {
  const project = useProjectContext();
  return <SortScope value={JSON.stringify([project.path, documentId])}>{children}</SortScope>;
}

/** The current tab's ordering, or the sidebar's ordering outside a tab. */
export function useExplorerSort(): ExplorerSort {
  const scope = use(SortScope);
  return useExplorerStore((state) => state.sorts[scope] ?? DEFAULT_SORT);
}

/** The writer for the current explorer's ordering. */
export function useSetExplorerSort() {
  const scope = use(SortScope);
  const setSort = useExplorerStore((state) => state.setSort);
  return useCallback((sort: ExplorerSort) => setSort(scope, sort), [scope, setSort]);
}
