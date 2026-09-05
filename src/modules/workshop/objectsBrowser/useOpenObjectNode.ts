import { useCallback } from "react";

import type { ObjectDeclaration } from "@/lib/tauri";

import { objectDocument } from "../documents/contentDocument";
import type { OpenIntent } from "../palette/types";
import { useOpenDocumentAs, usePromoteDocument } from "../state";
import type { ObjectTreeNode } from "./objectTree";

/** The declaration a row stands for: its own, or the first of the object's (ADR-0028). */
export function declarationOf(node: ObjectTreeNode): ObjectDeclaration | null {
  if (node.type === "declaration") return node.declaration;
  if (node.type === "object") return node.declarations[0] ?? null;
  return null;
}

/**
 * Open the object tab a row stands for.
 *
 * An object row opens its first declaration, a declaration row its own. `permanent`
 * pins the tab the way a double click asks, which promotes a preview already open.
 */
export function useOpenObjectNode() {
  const open = useOpenDocumentAs();
  const promote = usePromoteDocument();

  return useCallback(
    (node: ObjectTreeNode, intent: OpenIntent) => {
      if (node.type !== "object" && node.type !== "declaration") return;
      const declaration = declarationOf(node);
      if (!declaration) return;
      const document = objectDocument(
        declaration.asset,
        node.objectHash,
        node.path,
        declaration.file,
      );
      open(document, intent);
      if (intent === "permanent") promote(document.id);
    },
    [open, promote],
  );
}
