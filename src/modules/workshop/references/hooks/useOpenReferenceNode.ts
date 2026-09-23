import { useCallback } from "react";

import { rowKey } from "../../bin/tree/utils/binRows";
import { objectDocument } from "../../documents/utils/contentDocument";
import type { OpenIntent } from "../../palette/utils/types";
import { useOpenDocumentAs, usePromoteDocument, useRevealRow } from "../../state";
import type { ReferenceObjectNode } from "../utils/referenceTree";

/**
 * Open the object tab a row stands for: its object, in the file its group is.
 *
 * A row a walk found opens the tab scrolled to the property holding the reference.
 * `permanent` pins the tab the way a double click asks, which promotes a preview already
 * open.
 */
export function useOpenReferenceNode() {
  const open = useOpenDocumentAs();
  const promote = usePromoteDocument();
  const revealRow = useRevealRow();

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
      if (node.property !== null) {
        revealRow(document.id, rowKey({ entry: node.objectHash, path: node.property.path }));
      }
    },
    [open, promote, revealRow],
  );
}
