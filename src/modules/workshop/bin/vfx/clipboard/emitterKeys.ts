import type { TemplateEmitter } from "@/lib/tauri";

import type { CanvasNode } from "../drivers/components/canvasNodes";
import type { EmitterRef } from "./emitterCopy";

/** Returns the emitters of the selected master nodes of `nodes`, as emitters of the system `entry`. */
export function selectedEmitters(nodes: readonly CanvasNode[], entry: string): EmitterRef[] {
  return nodes.flatMap((node) => {
    const item = node.type === "frame" || !node.selected ? null : node.data.placed.item;
    return item?.type === "master" ? [{ entry, wire: item.wire, name: item.name }] : [];
  });
}

/** The emitter actions of an open system. A document that takes no edit copies alone. */
export interface EmitterClipboard {
  /** Copies `emitters` and the child systems that they link. */
  readonly copy: (emitters: readonly EmitterRef[]) => Promise<void>;
  /** Null where the document takes no edit. */
  readonly duplicate: ((emitter: EmitterRef) => Promise<void>) | null;
  /**
   * Lands the clipboard's emitters in the system `entry`: the emitters of `after`'s list after
   * it, and the others at the end of their own list. Null where the document takes no edit or no
   * system is read.
   */
  readonly paste: ((entry: string, after: EmitterRef | null) => Promise<void>) | null;
  /** Null where the document takes no edit. */
  readonly remove: ((emitter: EmitterRef) => Promise<void>) | null;
  /**
   * Land a template's emitters in the system `entry`, after `after` or else last, each named
   * apart from the system's, answering whether the edit landed. Null where the document takes
   * no edit or no system is read.
   */
  readonly land:
    | ((
        entry: string,
        after: EmitterRef | null,
        emitters: readonly TemplateEmitter[],
      ) => Promise<boolean>)
    | null;
}

/** The keys of a chord, as a keyboard event carries them. */
interface Chord {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

/**
 * Run what Ctrl+D, Ctrl+C, Ctrl+V or Delete asks of the emitter `picked`, answering whether
 * one ran.
 *
 * Duplicate and delete need a picked emitter, copy takes the `selected` emitters, and a paste
 * lands after the picked emitter or at the end.
 */
export function runEmitterKey(
  chord: Chord,
  clipboard: EmitterClipboard | null,
  entry: string,
  picked: EmitterRef | null,
  selected: readonly EmitterRef[],
): boolean {
  if (clipboard === null || entry === "") return false;

  const { copy, duplicate, paste, remove } = clipboard;
  const bare = !(chord.ctrlKey || chord.metaKey || chord.shiftKey || chord.altKey);
  if (bare && chord.key === "Delete") {
    if (picked === null || remove === null) return false;

    void remove(picked);
    return true;
  }

  if (!(chord.ctrlKey || chord.metaKey) || chord.shiftKey || chord.altKey) return false;

  switch (chord.key.toLowerCase()) {
    case "d":
      if (picked === null || duplicate === null) return false;
      void duplicate(picked);
      return true;
    case "c":
      if (selected.length === 0) return false;
      void copy(selected);
      return true;
    case "v":
      if (paste === null) return false;
      void paste(entry, picked);
      return true;
    default:
      return false;
  }
}
