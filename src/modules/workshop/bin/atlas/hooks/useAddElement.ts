import { useCallback, useEffect, useState } from "react";

import { type AddTarget, newElementEdits, newElementName } from "../engine/edit/newElement";
import type { ElementKind } from "../engine/model/elementKinds";
import type { ViewTree } from "../engine/model/tree";
import { useAtlasEdit } from "../state/atlasEdit";
import { useAtlasPreviewActions } from "../state/atlasPreview";
import { useModFolder } from "./useModFolder";
import { type ObjectGate, useObjectBlock } from "./useObjectBlock";

export interface ElementAdder extends ObjectGate {
  readonly busy: boolean;
  /**
   * Add an element of `kind` at `target`, its corner at `position` in source pixels, or centred
   * on the screen for none.
   */
  readonly add: (
    kind: ElementKind,
    target: AddTarget,
    position?: readonly [number, number] | null,
  ) => Promise<void>;
}

/**
 * Adding an element to the view `view`, whose tree is `tree`, per "Interaction" in
 * docs/plans/atlas-ui-editor.md.
 *
 * The element is created empty and then filled (`newElementEdits`), which is two undo steps, and
 * it is selected once the view reads it, so an added group takes the next element.
 */
export function useAddElement(view: string, tree: ViewTree | null): ElementAdder {
  const edit = useAtlasEdit();
  const gate = useObjectBlock(view);
  const folder = useModFolder();
  const { select } = useAtlasPreviewActions();
  const [busy, setBusy] = useState(false);
  const blocked = gate.block !== null;

  /* The element just added, selected once the view holds it. */
  const [added, setAdded] = useState<string | null>(null);
  useEffect(() => {
    if (added === null || tree === null || !tree.elements.has(added)) return;

    select(view, added);
    setAdded(null);
  }, [added, tree, view, select]);

  const add = useCallback<ElementAdder["add"]>(
    async (kind, target, position = null) => {
      if (edit === null || tree === null || blocked) return;

      setBusy(true);
      try {
        const name = newElementName(tree, folder, target, kind);
        const created = await edit.create(name, { type: "class", class: kind.class });
        if (created === null) return;

        await edit.apply(newElementEdits(tree, created, name, kind, target, position));
        setAdded(created);
      } finally {
        setBusy(false);
      }
    },
    [edit, tree, blocked, folder],
  );

  return { ...gate, busy, add };
}
