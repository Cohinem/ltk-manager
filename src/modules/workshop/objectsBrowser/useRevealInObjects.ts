import { useCallback } from "react";

import {
  useExpandObjectPrefixes,
  useRequestObjectsReveal,
  useSetObjectsSearchPattern,
} from "@/stores";

import { objectsDocument } from "../documents/contentDocument";
import { useOpenDocument } from "../state";
import { ancestorPrefixes } from "./objectTree";

/**
 * Open the objects browser, expand an object's path and focus its row.
 *
 * "Reveal in Objects" in docs/ux/PROJECT_EDITOR.md. The box is cleared. The browse tree
 * is the one whose rows the reveal lands on.
 */
export function useRevealInObjects(): (objectPath: string) => void {
  const openDocument = useOpenDocument();
  const setPattern = useSetObjectsSearchPattern();
  const expand = useExpandObjectPrefixes();
  const request = useRequestObjectsReveal();

  return useCallback(
    (objectPath) => {
      openDocument(objectsDocument());
      setPattern("");
      expand(ancestorPrefixes(objectPath));
      request(objectPath);
    },
    [expand, openDocument, request, setPattern],
  );
}
