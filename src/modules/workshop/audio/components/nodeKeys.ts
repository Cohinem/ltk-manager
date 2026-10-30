import type { NodeActions } from "./EventMenu";

/** The modifier and key state of a key press that `nodeKey` reads. */
interface KeyPress {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

/**
 * Applies the node key of `event` to the picked rows: Ctrl+Enter adds, Ctrl+D duplicates and
 * Delete deletes, as `NODE_KEYS` names them. Returns `true` if the key was a node key.
 */
export function nodeKey(event: KeyPress, actions: NodeActions | null): boolean {
  if (actions === null || event.altKey || event.shiftKey) return false;

  const command = event.ctrlKey || event.metaKey;
  if (command && event.key === "Enter") {
    actions.add?.();
    return true;
  }
  if (command && event.key.toLowerCase() === "d") {
    actions.duplicate?.();
    return true;
  }
  if (!command && event.key === "Delete") {
    actions.remove?.();
    return true;
  }
  return false;
}
