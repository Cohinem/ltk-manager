import { useCallback } from "react";

import { useInheritedLayouts } from "../../bin/classes/hooks/useInheritedLayouts";
import { type ObjectPreviewKind, objectPreviewKind } from "../utils/objectPreview";
import type { ObjectTreeNode } from "../utils/objectTree";

/** `objectPreviewKind` with the layouts classes take from their bases. */
export function useObjectPreviewKind(): (node: ObjectTreeNode) => ObjectPreviewKind | null {
  const inherited = useInheritedLayouts();
  return useCallback((node) => objectPreviewKind(node, inherited), [inherited]);
}
