import { useState } from "react";

import { useFindBox } from "@/modules/editor";

import { useExplorerKeys, useExplorerNav } from "../../explorer";

/** A game explorer document's navigation, its find box, and the keys that drive both. */
export function useExplorerShell(explorerId: string, documentId: string) {
  const nav = useExplorerNav(explorerId, documentId);
  const [typing, setTyping] = useState(false);
  const boxRef = useFindBox(documentId);

  const handleKeyDown = useExplorerKeys({
    onUp: nav.goUp,
    onType: () => setTyping(true),
    boxRef,
  });

  return { nav, typing, setTyping, boxRef, handleKeyDown };
}
