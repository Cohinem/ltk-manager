import { useCallback } from "react";

import { useShowSidebarView } from "@/stores";

import {
  useExpandObjectPrefixes,
  useRequestObjectsReveal,
  useSetObjectsSearchPattern,
} from "../../state";
import { ancestorPrefixes, isObjectHash } from "../utils/objectTree";

/**
 * Show the objects view, expand an object's path and focus its row.
 *
 * "Reveal in Objects" in docs/ux/PROJECT_EDITOR.md. The box is cleared. The browse tree
 * or grid keeps its selected presentation.
 */
export function useRevealInObjects(): (objectPath: string) => void {
  const showView = useShowSidebarView();
  const setPattern = useSetObjectsSearchPattern();
  const expand = useExpandObjectPrefixes();
  const request = useRequestObjectsReveal();

  return useCallback(
    (objectPath) => {
      /* A row's id spells a hash in lower case, whatever opened the tab spelled. */
      const id = isObjectHash(objectPath) ? objectPath.toLowerCase() : objectPath;

      showView("objects");
      setPattern("");
      expand(ancestorPrefixes(id));
      request(id);
    },
    [expand, showView, request, setPattern],
  );
}
