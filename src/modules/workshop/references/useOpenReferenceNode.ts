import { useCallback } from "react";

import { objectDocument } from "../documents/contentDocument";
import type { OpenIntent } from "../palette/types";
import { useOpenDocumentAs, usePromoteDocument } from "../state";
import type { ReferenceObjectNode } from "./referenceTree";

/**
 * Open the object tab a row stands for: its object, in the file its group is.
 *
 * `permanent` pins the tab the way a double click asks, which promotes a preview
 * already open.
 */
export function useOpenReferenceNode() {
  const open = useOpenDocumentAs();
  const promote = usePromoteDocument();

  return useCallback(
    (node: ReferenceObjectNode, intent: OpenIntent) => {
      const document = objectDocument(
        node.asset,
        node.objectHash,
        node.path,
        node.file,
        node.class,
      );
      open(document, intent);
      if (intent === "permanent") promote(document.id);
    },
    [open, promote],
  );
}
