import { use, useMemo } from "react";

import { LeafEditContext } from "../../../tree/hooks/useLeafEdit";
import type { GraphItem, StructItem } from "../utils/graphItems";
import { holderRow } from "../utils/holderRow";
import {
  listAppend,
  nodeDuplicate,
  nodeRemoval,
  type NodeRemoval,
  type PropertyEdit,
} from "../utils/nodeEdits";
import { GraphActionsContext } from "./graphActions";

/**
 * The structural edits of the Graph pane's nodes below an emitter, each one undo step: Delete
 * takes a node's value out of the file, Duplicate copies a list item after itself, and Add
 * item appends to a list. An action is null where the node has nothing to act on or the
 * document takes no edit.
 */
export interface NodeStructure {
  readonly remove: (item: GraphItem) => (() => void) | null;
  readonly duplicate: (item: GraphItem) => (() => void) | null;
  readonly append: (item: StructItem) => (() => void) | null;
}

export function useNodeStructure(): NodeStructure {
  const entry = use(GraphActionsContext)?.entry ?? "";
  const edit = use(LeafEditContext);

  return useMemo(() => {
    const send = (at: PropertyEdit | null) => {
      const editProperty = edit?.editProperty;
      if (at === null || entry === "" || editProperty === undefined) return null;
      return () => void editProperty(holderRow(entry, at.holder), at.field, at.edits);
    };
    const drop = (removal: NodeRemoval | null) => {
      const call = removal?.type === "item" ? edit?.removeItem : edit?.removeProperty;
      if (removal === null || entry === "" || call === undefined) return null;
      return () => void call(holderRow(entry, removal.path));
    };

    return {
      remove: (item) => drop(nodeRemoval(item)),
      duplicate: (item) => send(nodeDuplicate(item)),
      append: (item) => send(listAppend(item)),
    };
  }, [entry, edit]);
}

/** The keys a chord carries, as a keyboard event has them. */
interface Chord {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

/** Run what Delete or Ctrl+D asks of the one node `picked`, answering whether one ran. */
export function runNodeKey(
  chord: Chord,
  structure: NodeStructure,
  picked: GraphItem | null,
): boolean {
  if (picked === null || chord.shiftKey || chord.altKey) return false;

  const modified = chord.ctrlKey || chord.metaKey;
  let action: (() => void) | null = null;
  if (!modified && chord.key === "Delete") action = structure.remove(picked);
  if (modified && chord.key.toLowerCase() === "d") action = structure.duplicate(picked);
  if (action === null) return false;

  action();
  return true;
}
